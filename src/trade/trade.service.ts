import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatEther, parseEther, Wallet, ZeroAddress, ZeroHash } from 'ethers';
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
} from 'src/types/market.types';
import { Trade, TradeStatus } from 'generated/prisma/client';
import { PredictRepository } from 'src/predict/predict.repository';
import { getComplement, normalizeDepth } from 'src/common/utils/orderbook';
import { MIN_PROFIT_USD } from 'src/common/helpers/constants';
import {
  getAutoTradeIntervalMs as getAutoTradeIntervalMsHelper,
  getChosenOutcomeIndexByTradeType,
  getMarketTimeLeftSeconds as getMarketTimeLeftSecondsHelper,
  isWebsocketAutoTradeEnabled as isWebsocketAutoTradeEnabledHelper,
  getUnrealizedPnlUsdForToday as getUnrealizedPnlUsdForTodayHelper,
  recordDailyRealizedPnl as recordDailyRealizedPnlHelper,
  shouldHaltTradingForDay as shouldHaltTradingForDayHelper,
  getLimitOrderPricing,
  getLimitOrderProfit,
  isPositionReachedProfitThreshold,
  isPositionReachedThreshold,
} from './trade.service.helper';
import { parseBooleanFlag } from 'src/common/utils/boolean';
import type { BuyTradeType } from 'src/predict/buy-trade-type';

@Injectable()
export class TradeService {
  private readonly logger = new Logger(TradeService.name);
  private readonly dailyRealizedPnlUsdByDate = new Map<string, number>();

  constructor(
    private readonly predictRepository: PredictRepository,
    private readonly configService: ConfigService,
  ) {}

  private async shouldHaltTradingForDay(
    positions?: Position[],
  ): Promise<boolean> {
    const result = await shouldHaltTradingForDayHelper({
      configService: this.configService,
      dailyRealizedPnlUsdByDate: this.dailyRealizedPnlUsdByDate,
      positions,
      getUnrealizedPnlUsdForToday: getUnrealizedPnlUsdForTodayHelper,
      getTradeByMarketId: this.predictRepository.getTradeByMarketId.bind(
        this.predictRepository,
      ),
    });
    if (
      result.shouldHalt &&
      result.reason &&
      result.totalPnlUsd !== undefined &&
      result.limitUsd !== undefined
    ) {
      this.logger.warn(
        `Daily ${result.reason} limit reached. PnL: ${result.totalPnlUsd.toFixed(2)} ${
          result.reason === 'profit' ? '>=' : '<='
        } ${
          result.reason === 'profit' ? result.limitUsd : -result.limitUsd
        }. Halting trades for today.`,
      );
    }
    return result.shouldHalt;
  }

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
    if (await this.shouldHaltTradingForDay(positions)) {
      return;
    }

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
        const entryValueUsd = Number(trade.buyAmountInUsd);
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
          entryValueUsd,
          currentValueUsd,
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

  async evaluateProfitTaking(params: {
    positions: Position[];
    getOrderBookByMarketId: (marketId: number) => Promise<GetOrderBookResponse>;
    getMarketById: (marketId: number) => Promise<MarketDataResponse>;
    subscribeToOrderbook: (marketId: number) => void;
    getAmountPercentageForMarketSlug: (slug: string) => number | null;
    createOrder: (body: CreateOrderBody) => Promise<CreateOrderResponse>;
    orderBuilder: OrderBuilder;
    signer: Wallet;
  }): Promise<void> {
    if (
      !parseBooleanFlag(
        this.configService.get<string>('PREDICT_PROFIT_TAKING_ENABLED'),
      )
    ) {
      return;
    }
    const rawProfitPercentage = this.configService.get<string>(
      'PREDICT_PROFIT_TAKING_PERCENTAGE',
    );
    const profitTakingPercentage = Number(rawProfitPercentage);
    if (
      !Number.isFinite(profitTakingPercentage) ||
      profitTakingPercentage <= 0
    ) {
      this.logger.warn(
        `Profit-taking skipped. Invalid PREDICT_PROFIT_TAKING_PERCENTAGE: ${rawProfitPercentage ?? 'N/A'}.`,
      );
      return;
    }

    const {
      positions,
      getOrderBookByMarketId,
      getMarketById,
      subscribeToOrderbook,
      getAmountPercentageForMarketSlug,
      createOrder,
      orderBuilder,
      signer,
    } = params;
    if (await this.shouldHaltTradingForDay(positions)) {
      return;
    }

    for (const position of positions) {
      if (position.market.status === MarketStatus.RESOLVED) {
        continue;
      }

      const amountPercentage = getAmountPercentageForMarketSlug(
        position.market.categorySlug,
      );
      if (amountPercentage === null) {
        this.logger.warn(
          `Profit-taking check skipped. No configured amount percentage for market ${position.market.id} slug ${position.market.categorySlug}.`,
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
        const entryValueUsd = Number(trade.buyAmountInUsd);
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
          !isPositionReachedProfitThreshold({
            entryValueUsd,
            currentValueUsd,
            profitTakingPercentage,
          })
        ) {
          this.logger.warn(
            `Profit-taking not reached for market ${position.market.id}. Skipping sell.`,
          );
          continue;
        }

        const profitPercentage =
          ((currentValueUsd - entryValueUsd) / entryValueUsd) * 100;
        this.logger.log(
          `Profit-taking reached for market ${position.market.id}: ${profitPercentage.toFixed(2)}% >= ${profitTakingPercentage}%. Selling position.`,
        );

        await this.sellPosition({
          existingTrade: trade,
          position,
          orderBuilder,
          signer,
          entryValueUsd,
          currentValueUsd,
          amountPercentage,
          getOrderBookByMarketId,
          getMarketById,
          subscribeToOrderbook,
          createOrder,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to evaluate profit-taking for market ${position.market.id}: ${
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
    positions?: Position[];
    getMarketSlugById: (marketId: number) => string | null;
    getTradeAmountForMarketSlug: (slug: string) => number;
    getEntrySecondsForMarketSlug: (slug: string) => number | null;
    getBuyTradeTypeForMarketSlug: (slug: string) => BuyTradeType;
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
      positions = [],
      getMarketSlugById,
      getTradeAmountForMarketSlug,
      getEntrySecondsForMarketSlug,
      getBuyTradeTypeForMarketSlug,
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
    if (await this.shouldHaltTradingForDay(positions)) {
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
      const buyTradeType = getBuyTradeTypeForMarketSlug(slug);
      const marketTrade: SaveMarketTradeInput = {
        marketId,
        slug,
        buyAmount: amount,
        buyAmountInUsd: amount,
        buyTimestamp: new Date(),
        status: TradeStatus.BOUGHT,
      };
      await this.buyPosition({
        market: marketTrade,
        orderBuilder,
        signer,
        entrySeconds,
        buyTradeType,
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
    buyTradeType: BuyTradeType;
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
      buyTradeType,
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
    const timeLeftSeconds = getMarketTimeLeftSecondsHelper(marketData.data);
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

    if (yesBuyPrice === 0 || noBuyPrice === 0) {
      this.logger.warn(
        `Skipping auto-trade for market ${marketId}. One of the outcomes has price 0 (YES: ${yesBuyPrice}, NO: ${noBuyPrice}).`,
      );
      return;
    }
    const chosenOutcomeIndex = getChosenOutcomeIndexByTradeType(buyTradeType);

    this.logger.log(
      `YES: ${yesBuyPrice} - NO: ${noBuyPrice} - TRADE_TYPE: ${buyTradeType} => Outcome Index: ${chosenOutcomeIndex}`,
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

    const budgetInWei = parseEther(market.buyAmount.toString());
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
    entryValueUsd?: number;
    currentValueUsd?: number;
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
      entryValueUsd,
      currentValueUsd,
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
    const quantityWei = (baseQuantityWei * BigInt(percentage)) / 100n;
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

    const order = orderBuilder.buildOrder(OrderStrategy.LIMIT, {
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

    const createOrderResponse = await createOrder(createOrderBody);
    if (!createOrderResponse.success) {
      this.logger.warn(
        `Failed to create order: ${createOrderResponse.error!._tag}`,
      );
      return;
    }
    if (
      Number.isFinite(entryValueUsd) &&
      Number.isFinite(currentValueUsd) &&
      entryValueUsd !== undefined &&
      currentValueUsd !== undefined
    ) {
      const pnlEntry = recordDailyRealizedPnlHelper({
        dailyRealizedPnlUsdByDate: this.dailyRealizedPnlUsdByDate,
        amountUsd: currentValueUsd - entryValueUsd,
        marketId: existingTrade.marketId,
        timestamp: new Date(),
      });
      if (pnlEntry) {
        this.logger.log(
          `Daily realized PnL updated. Market: ${pnlEntry.marketId ?? 'N/A'}; Amount: ${pnlEntry.amountUsd.toFixed(2)}; Total: ${pnlEntry.totalUsd.toFixed(2)}; Timestamp: ${pnlEntry.timestamp.toISOString()}`,
        );
      }
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
