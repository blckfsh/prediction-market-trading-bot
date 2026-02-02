import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  formatEther,
  parseEther,
  Wallet,
  WeiPerEther,
  ZeroAddress,
  ZeroHash,
} from 'ethers';
import { OrderBuilder, Side } from '@predictdotfun/sdk';
import {
  CreateOrderBody,
  CreateOrderResponse,
  GetOrderBookResponse,
  MarketDataResponse,
  MarketStatus,
  OrderStrategy,
  Position,
  SaveMarketTradeInput,
  TradeStrategy,
} from '../types/market.types';
import { Trade, TradeStatus } from 'generated/prisma/client';
import { PredictRepository } from '../predict.repository';
import { getComplement, normalizeDepth } from 'src/lib/utils/orderbook';
import {
  getAutoTradeIntervalMs as getAutoTradeIntervalMsHelper,
  getMarketTimeLeftSeconds,
  isWebsocketAutoTradeEnabled as isWebsocketAutoTradeEnabledHelper,
} from 'src/lib/helpers/bot';
import { MIN_PROFIT_USD, SLIPPAGE_BPS } from 'src/lib/helpers/constants';
import {
  getLimitOrderPricing,
  getLimitOrderProfit,
  isPositionReachedThreshold,
} from 'src/lib/helpers/trade';

@Injectable()
export class TradeService {
  private readonly logger = new Logger(TradeService.name);

  constructor(
    private readonly predictRepository: PredictRepository,
    private readonly configService: ConfigService,
  ) {}

  async evaluateStopLoss(params: {
    positions: Position[];
    getOrderBookByMarketId: (marketId: number) => Promise<GetOrderBookResponse>;
    getMarketById: (marketId: number) => Promise<MarketDataResponse>;
    subscribeToOrderbook: (marketId: number) => void;
    getStopLossPercentageForMarketSlug: (slug: string) => number | null;
    getAmountPercentageForMarketSlug: (slug: string) => number | null;
    createOrder: (body: CreateOrderBody) => Promise<CreateOrderResponse>;
    orderBuilder: OrderBuilder;
    signer: Wallet;
  }): Promise<void> {
    const {
      positions,
      getOrderBookByMarketId,
      getMarketById,
      subscribeToOrderbook,
      getStopLossPercentageForMarketSlug,
      getAmountPercentageForMarketSlug,
      createOrder,
      orderBuilder,
      signer,
    } = params;

    for (const position of positions) {
      if (position.market.status === MarketStatus.RESOLVED) {
        continue;
      }

      const stopLossPercentage = getStopLossPercentageForMarketSlug(
        position.market.categorySlug,
      );
      if (stopLossPercentage === null) {
        this.logger.warn(
          `Stop-loss check skipped. No configured stop-loss for market ${position.market.id} slug ${position.market.categorySlug}.`,
        );
        continue;
      }
      const amountPercentage = getAmountPercentageForMarketSlug(
        position.market.categorySlug,
      );
      if (amountPercentage === null) {
        this.logger.warn(
          `Stop-loss check skipped. No configured amount percentage for market ${position.market.id} slug ${position.market.categorySlug}.`,
        );
        continue;
      }

      const trade = await this.predictRepository.getTradeByMarketId(
        position.market.id,
      );
      if (!trade || trade.status === TradeStatus.SOLD) {
        continue;
      }

      try {
        const entryValueUsd = trade.amount;
        if (!Number.isFinite(entryValueUsd) || entryValueUsd <= 0) {
          this.logger.warn(
            `Invalid entry value for market ${position.market.id}. Skipping sell.`,
          );
          continue;
        }

        const currentValueUsd = Number(position.valueUsd);
        if (!Number.isFinite(currentValueUsd)) {
          this.logger.warn(
            `Invalid position value for market ${position.market.id}. Skipping sell.`,
          );
          continue;
        }

        if (
          !isPositionReachedThreshold({
            entryValueUsd,
            currentValueUsd,
            stopLossPercentage,
          })
        ) {
          continue;
        }

        const lossPercentage =
          ((entryValueUsd - currentValueUsd) / entryValueUsd) * 100;
        this.logger.warn(
          `Stop-loss reached for market ${position.market.id}: ${lossPercentage.toFixed(2)}% >= ${stopLossPercentage}%. Selling position.`,
        );

        await this.sellPosition({
          existingTrade: trade,
          position,
          orderBuilder,
          signer,
          amountPercentage,
          getOrderBookByMarketId,
          getMarketById,
          subscribeToOrderbook,
          createOrder,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to evaluate stop-loss for market ${position.market.id}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    }
  }

  async createOrder(params: {
    baseUrl: string;
    apiKey: string;
    token: string;
    createOrderBody: CreateOrderBody;
  }): Promise<CreateOrderResponse> {
    const { baseUrl, apiKey, token, createOrderBody } = params;
    let data: CreateOrderResponse | null = null;
    let createOrderResponse: CreateOrderResponse | null = null;

    try {
      const headers = new Headers();
      headers.append('x-api-key', apiKey);
      headers.append('Authorization', `Bearer ${token}`);

      const requestOptions = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(createOrderBody),
        redirect: 'follow',
      };

      const response = await fetch(
        `${baseUrl}/orders`,
        requestOptions as RequestInit,
      );
      data = (await response.json()) as CreateOrderResponse;
      createOrderResponse = data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create order: ${error.message}`);
      }
      throw new Error('Failed to create order: Unknown error');
    } finally {
      this.logger.log(
        `Order created, id: ${createOrderResponse?.data?.orderId ?? 'N/A'}`,
      );
    }

    return data;
  }

  async createTradeFromOrderbook(params: {
    marketId: number;
    marketTradeInFlight: Set<number>;
    marketTradeLastAttemptAt: Map<number, number>;
    getMarketSlugById: (marketId: number) => string | null;
    getTradeAmountForMarketSlug: (slug: string) => number;
    getEntrySecondsForMarketSlug: (slug: string) => number | null;
    orderBuilder: OrderBuilder;
    signer: Wallet;
    getOrderBookByMarketId: (marketId: number) => Promise<GetOrderBookResponse>;
    getMarketById: (marketId: number) => Promise<MarketDataResponse>;
    subscribeToOrderbook: (marketId: number) => void;
    requestContext: {
      baseUrl: string;
      apiKey: string;
      token: string;
    };
  }): Promise<void> {
    const {
      marketId,
      marketTradeInFlight,
      marketTradeLastAttemptAt,
      getMarketSlugById,
      getTradeAmountForMarketSlug,
      getEntrySecondsForMarketSlug,
      orderBuilder,
      signer,
      getOrderBookByMarketId,
      getMarketById,
      subscribeToOrderbook,
      requestContext,
    } = params;
    if (!isWebsocketAutoTradeEnabledHelper(this.configService)) {
      return;
    }

    if (marketTradeInFlight.has(marketId)) {
      return;
    }

    const cooldownMs = getAutoTradeIntervalMsHelper(this.configService);
    const lastAttemptAt = marketTradeLastAttemptAt.get(marketId) ?? 0;
    if (cooldownMs > 0 && Date.now() - lastAttemptAt < cooldownMs) {
      return;
    }
    marketTradeInFlight.add(marketId);
    marketTradeLastAttemptAt.set(marketId, Date.now());

    try {
      const slug = getMarketSlugById(marketId);
      if (!slug) {
        throw new Error(`Market slug not found for marketId ${marketId}`);
      }
      
      const entrySeconds = getEntrySecondsForMarketSlug(slug);
      if (entrySeconds === null) {
        this.logger.warn(
          `Skipping auto-trade for market ${marketId}. Entry seconds not configured for slug ${slug}.`,
        );
        return;
      }
      const amount = getTradeAmountForMarketSlug(slug);
      const marketTrade: SaveMarketTradeInput = {
        marketId,
        slug,
        amount,
        timestamp: new Date(),
        status: TradeStatus.BOUGHT,
      };
      await this.buyPosition({
        market: marketTrade,
        orderBuilder,
        signer,
        entrySeconds,
        getOrderBookByMarketId,
        getMarketById,
        subscribeToOrderbook,
        requestContext,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to auto-create market trade for ${marketId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    } finally {
      marketTradeInFlight.delete(marketId);
    }
  }

  private async buyPosition(params: {
    market: SaveMarketTradeInput;
    orderBuilder: OrderBuilder;
    signer: Wallet;
    entrySeconds?: number | null;
    getOrderBookByMarketId: (marketId: number) => Promise<GetOrderBookResponse>;
    getMarketById: (marketId: number) => Promise<MarketDataResponse>;
    subscribeToOrderbook: (marketId: number) => void;
    createOrder?: (body: CreateOrderBody) => Promise<CreateOrderResponse>;
    requestContext?: {
      baseUrl: string;
      apiKey: string;
      token: string;
    };
  }): Promise<Trade | void> {
    const {
      market,
      orderBuilder,
      signer,
      entrySeconds,
      getOrderBookByMarketId,
      getMarketById,
      subscribeToOrderbook,
      createOrder,
      requestContext,
    } = params;
    const createOrderFn =
      createOrder ??
      (requestContext
        ? (body: CreateOrderBody) =>
            this.createOrder({ ...requestContext, createOrderBody: body })
        : null);
    const { marketId } = market;
    const { data: book } = await getOrderBookByMarketId(marketId);
    const trade = await this.predictRepository.getTradeByMarketId(marketId);
    if (trade) {
      this.logger.warn(`Trade already exists. Market ID: ${marketId}`);
      return;
    }

    const marketData = await getMarketById(marketId);
    const timeLeftSeconds = getMarketTimeLeftSeconds(marketData.data);
    if (timeLeftSeconds === 0) {
      this.logger.warn(
        `Skipping auto-trade for market ${marketId}. Market time left is 0s.`,
      );
      return;
    }
    if (entrySeconds !== null && entrySeconds !== undefined) {
      const createdAtMs = new Date(marketData.data.createdAt).getTime();
      if (Number.isNaN(createdAtMs)) {
        this.logger.warn(
          `Skipping auto-trade for market ${marketId}. Invalid createdAt: ${marketData.data.createdAt}`,
        );
        return;
      }
      const readyAtMs = createdAtMs + entrySeconds * 1000;
      if (Date.now() < readyAtMs) {
        this.logger.warn(
          `Skipping auto-trade for market ${marketId}. Entry not reached yet (createdAt: ${marketData.data.createdAt}, entrySeconds: ${entrySeconds}).`,
        );
        return;
      }
    }
    this.logger.log(
      `Market ${marketId} feeRateBps: ${marketData.data.feeRateBps}`,
    );
    subscribeToOrderbook(marketData.data.id);

    // NOTE: Get the average buy price of the yes and no outcomes.
    const yesBuyPrice = book.asks.length > 0 ? book.asks[0][0] : 0;
    const noBuyPrice = getComplement(
      book.bids.length > 0 ? book.bids[0][0] : 0,
      marketData.data.decimalPrecision,
    );

    if (yesBuyPrice === noBuyPrice) {
      this.logger.warn('Yes and no buy prices are equal');
      return;
    }

    const chosenOutcomeIndex: number = yesBuyPrice > noBuyPrice ? 0 : 1;
    this.logger.log(
      `YES: ${yesBuyPrice} - NO: ${noBuyPrice} => Outcome Index: ${chosenOutcomeIndex}`,
    );
    const outcomeOnChainId =
      marketData.data.outcomes[chosenOutcomeIndex].onChainId;

    const rawTargetPrice = chosenOutcomeIndex === 0 ? yesBuyPrice : noBuyPrice;
    if (rawTargetPrice <= 0) {
      this.logger.warn(
        `Skipping limit order for market ${marketId}. Limit price per share is less than or equal to 0`,
      );
      return;
    }

    const precision = marketData.data.decimalPrecision ?? 2;
    this.logger.log(`Market ${marketId} decimalPrecision: ${precision}`);
    // computation max payout per share: 1 ether - fee rate bps / 100%
    const { targetPrice, pricePerShareWei, maxPayoutPerShareWei } =
      getLimitOrderPricing({
        rawTargetPrice,
        decimalPrecision: precision,
        feeRateBps: marketData.data.feeRateBps,
      });
    if (pricePerShareWei >= maxPayoutPerShareWei) {
      this.logger.warn(`Skipping limit order for market ${marketId}.`);
      this.logger.warn(`Price ${targetPrice} is not profitable after fees.`);
      this.logger.warn(
        `Max profitable price: ${formatEther(maxPayoutPerShareWei)}`,
      );
      return;
    }

    const budgetInWei = parseEther(market.amount.toString());
    const { quantityWei, expectedProfitWei } = getLimitOrderProfit({
      budgetInWei,
      pricePerShareWei,
      maxPayoutPerShareWei,
    });
    if (quantityWei <= 0n) {
      this.logger.warn(
        `Skipping limit order for market ${marketId}. Quantity is less than or equal to 0`,
      );
      return;
    }

    const minProfitWei = parseEther(MIN_PROFIT_USD.toString());

    if (expectedProfitWei < minProfitWei) {
      this.logger.warn(`Skipping limit order for market ${marketId}.`);
      this.logger.warn(
        `Expected profit: ${formatEther(expectedProfitWei)} < min ${MIN_PROFIT_USD} USD.`,
      );
      return;
    }

    const { pricePerShare, makerAmount, takerAmount } =
      orderBuilder.getLimitOrderAmounts({
        side: Side.BUY,
        pricePerShareWei,
        quantityWei,
      });

    const order = orderBuilder.buildOrder(OrderStrategy.LIMIT, {
      maker: signer.address,
      signer: signer.address,
      side: Side.BUY,
      tokenId: outcomeOnChainId,
      makerAmount: makerAmount,
      takerAmount: takerAmount,
      feeRateBps: marketData.data.feeRateBps,
    });

    const typedData = orderBuilder.buildTypedData(order, {
      isNegRisk: marketData.data.isNegRisk,
      isYieldBearing: marketData.data.isYieldBearing,
    });
    const signedOrder = await orderBuilder.signTypedDataOrder(typedData);
    const hash = await orderBuilder.buildTypedDataHash(typedData);

    const createOrderBody: CreateOrderBody = {
      data: {
        pricePerShare: pricePerShare.toString(),
        strategy: TradeStrategy.LIMIT,
        slippageBps: '0',
        isFillOrKill: false,
        order: {
          hash,
          salt: signedOrder.salt.toString(),
          maker: signedOrder.maker,
          signer: signedOrder.signer,
          taker: signedOrder.taker ?? ZeroAddress,
          tokenId: signedOrder.tokenId.toString(),
          makerAmount: signedOrder.makerAmount.toString(),
          takerAmount: signedOrder.takerAmount.toString(),
          expiration: signedOrder.expiration.toString(),
          nonce: signedOrder.nonce.toString(),
          feeRateBps: signedOrder.feeRateBps.toString(),
          side: signedOrder.side,
          signatureType: signedOrder.signatureType,
          signature: signedOrder.signature,
        },
      },
    };

    if (!createOrderFn) {
      this.logger.warn(
        `Missing order creation handler for market ${marketId}. Skipping buy.`,
      );
      return;
    }
    const createOrderResponse = await createOrderFn(createOrderBody);
    if (!createOrderResponse.success) {
      this.logger.warn(
        `Failed to create order: ${createOrderResponse.error!._tag}`,
      );
      return;
    }

    market.buyOrderHash =
      createOrderResponse.data?.orderHash ?? ZeroHash.toString();
    return this.predictRepository.saveMarketTrade(market);
  }

  private async sellPosition(params: {
    existingTrade: Trade;
    position: Position;
    orderBuilder: OrderBuilder;
    signer: Wallet;
    amountPercentage: number;
    getOrderBookByMarketId: (marketId: number) => Promise<GetOrderBookResponse>;
    getMarketById: (marketId: number) => Promise<MarketDataResponse>;
    subscribeToOrderbook: (marketId: number) => void;
    createOrder: (body: CreateOrderBody) => Promise<CreateOrderResponse>;
  }): Promise<Trade | void> {
    const {
      existingTrade,
      position,
      orderBuilder,
      signer,
      amountPercentage,
      getOrderBookByMarketId,
      getMarketById,
      subscribeToOrderbook,
      createOrder,
    } = params;

    const { data: book } = await getOrderBookByMarketId(position.market.id);
    const marketData = await getMarketById(position.market.id);
    this.logger.log(
      `Market ${position.market.id} feeRateBps: ${marketData.data.feeRateBps}`,
    );
    subscribeToOrderbook(marketData.data.id);

    const normalizedBook = {
      ...book,
      asks: normalizeDepth(book.asks),
      bids: normalizeDepth(book.bids),
    };

    if (!Number.isFinite(amountPercentage) || amountPercentage <= 0) {
      this.logger.warn(
        `Skipping sell for market ${position.market.id}. Invalid amount percentage: ${amountPercentage}`,
      );
      return;
    }
    const baseQuantityWei = BigInt(position.amount);
    const percentage =
      amountPercentage >= 100 ? 100 : Math.floor(amountPercentage);
    const quantityWei =
      (baseQuantityWei * BigInt(percentage)) / 100n;
    if (quantityWei <= 0n) {
      this.logger.warn(
        `Skipping sell for market ${position.market.id}. Quantity is less than or equal to 0`,
      );
      return;
    }

    const { pricePerShare, makerAmount, takerAmount } =
      orderBuilder.getMarketOrderAmounts(
        {
          side: Side.SELL,
          quantityWei,
        },
        normalizedBook, // It's recommended to re-fetch the orderbook regularly to avoid issues
      );

    if (pricePerShare <= 0n) {
      this.logger.warn('Price per share is less than or equal to 0');
      return;
    }

    const order = orderBuilder.buildOrder(OrderStrategy.MARKET, {
      maker: signer.address,
      signer: signer.address,
      side: Side.SELL,
      tokenId: position.outcome.onChainId,
      makerAmount: makerAmount,
      takerAmount: takerAmount,
      feeRateBps: marketData.data.feeRateBps,
    });

    const typedData = orderBuilder.buildTypedData(order, {
      isNegRisk: marketData.data.isNegRisk,
      isYieldBearing: marketData.data.isYieldBearing,
    });
    const signedOrder = await orderBuilder.signTypedDataOrder(typedData);
    const hash = await orderBuilder.buildTypedDataHash(typedData);

    const createOrderBody: CreateOrderBody = {
      data: {
        pricePerShare: pricePerShare.toString(),
        strategy: TradeStrategy.MARKET,
        slippageBps: SLIPPAGE_BPS.toString(), // Only used for `MARKET` orders, in this example it's 2%
        isFillOrKill: false,
        order: {
          hash,
          salt: signedOrder.salt.toString(),
          maker: signedOrder.maker,
          signer: signedOrder.signer,
          taker: signedOrder.taker ?? ZeroAddress,
          tokenId: signedOrder.tokenId.toString(),
          makerAmount: signedOrder.makerAmount.toString(),
          takerAmount: signedOrder.takerAmount.toString(),
          expiration: signedOrder.expiration.toString(),
          nonce: signedOrder.nonce.toString(),
          feeRateBps: signedOrder.feeRateBps.toString(),
          side: signedOrder.side,
          signatureType: signedOrder.signatureType,
          signature: signedOrder.signature,
        },
      },
    };

    const createOrderResponse = await createOrder(createOrderBody);
    if (!createOrderResponse.success) {
      this.logger.warn(
        `Failed to create order: ${createOrderResponse.error!._tag}`,
      );
      return;
    }

    const orderHash =
      createOrderResponse.data?.orderHash ?? ZeroHash.toString();
    return this.predictRepository.updateMarketTradeStatus(
      existingTrade.id,
      TradeStatus.SOLD,
      orderHash,
    );
  }
}
