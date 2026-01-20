import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  formatEther,
  formatUnits,
  parseEther,
  Wallet,
  ZeroAddress,
  ZeroHash,
} from 'ethers';
import {
  OrderBuilder,
  ChainId,
  Side,
  SetApprovalsResult,
} from '@predictdotfun/sdk';
import { MarketVariant, Trade, TradeConfig, TradeStatus, WalletApproval } from 'generated/prisma/client';
import { BalanceResponse } from 'src/predict/types/balance.types';
import {
  Category,
  Position,
  MarketStatistics,
  Market,
  OrderBookData,
  OrderStrategy,
  TradeStrategy,
  CreateOrderBody,
  SaveMarketTradeInput,
  GetAllMarketsResponse,
  GetAllPositionsResponse,
  GetCategoriesByResponse,
  GetMarketStatisticsResponse,
  GetOrderBookResponse,
  MarketDataResponse,
  CreateOrderResponse,
} from 'src/predict/types/market.types';
import {
  AuthMessageResponse,
  AuthResponse,
} from 'src/predict/types/auth.types';
import { PredictRepository } from 'src/predict/predict.repository';
import { targetSlugs } from 'src/lib/constants';
import { fetchWithRetry } from 'src/lib/utils/http';
import { getComplement, normalizeDepth } from 'src/lib/utils/orderbook';
import { filterAndSortCryptoUpDownCategories } from 'src/lib/utils/categories';

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);
  private baseUrl: string | undefined;
  private apiKey: string | undefined;
  private predictAccount: string | undefined;
  private walletPrivateKey: string | undefined;
  private signer: Wallet | null = null;
  private orderBuilder: OrderBuilder | null = null;
  private token: string | null = null;
  private categories: Category[] = [];
  private filteredCategories: Category[] = [];
  private positions: Position[] = [];
  private tradeConfigsByMarketVariant = new Map<MarketVariant, TradeConfig>();

  constructor(
    private readonly configService: ConfigService,
    private readonly predictRepository: PredictRepository,
  ) {}

  async onModuleInit() {
    if (!this.isBotEnabled()) {
      this.logger.warn(
        'Predict bot is disabled via PREDICT_BOT_ENABLED. Skipping startup.',
      );
      return;
    }
    this.logger.log('Setting up predict bot...');
    await this.initializeConfig();
    await this.initializeOrderBuilder();
    await this.initializeJWTAuthorization();
    await this.getUSDTBalance();
    this.logger.log('Predict bot setup completed successfully');
    this.logger.log('Searching markets...');
    await this.getAllMarkets();
    this.logger.log('Searching categories...');
    await this.initializeCategories();
    await this.initializeCategoryTable();
    this.logger.log('Checking for positions...');
    await this.initializePositionTable();
    this.logger.log('Loading trade configs...');
    await this.initializeTradeConfigs();
    this.logger.log('Setting approvals...');
    await this.setApprovals();
    this.logger.log('Creating market trades...');
    await this.initializeMarketTrade();
  }

  private isBotEnabled(): boolean {
    const raw = this.configService.get<string>('PREDICT_BOT_ENABLED');
    if (raw === undefined || raw === null || raw.trim() === '') {
      return true;
    }
    const normalized = raw.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  private async initializeConfig() {
    try {
      const errorInitializeMessage =
        'environment variable is not set. Predict bot will not be initialized.';
      // Validate environment variable
      this.baseUrl = this.configService.get<string>('PREDICT_API_BASE_URL');
      this.apiKey = this.configService.get<string>('PREDICT_API_KEY');
      this.predictAccount = this.configService.get<string>(
        'PREDICT_ACCOUNT_ADDRESS',
      );
      const walletPrivateKey =
        this.configService.get<string>('WALLET_PRIVATE_KEY');

      if (!this.baseUrl) {
        throw new Error(`PREDICT_API_BASE_URL ${errorInitializeMessage}`);
      } else if (!this.predictAccount) {
        throw new Error(`PREDICT_ACCOUNT_ADDRESS ${errorInitializeMessage}`);
      } else if (!this.apiKey) {
        throw new Error(`PREDICT_API_KEY ${errorInitializeMessage}`);
      } else if (!walletPrivateKey) {
        throw new Error(`WALLET_PRIVATE_KEY ${errorInitializeMessage}`);
      }

      this.walletPrivateKey = walletPrivateKey.startsWith('0x')
        ? walletPrivateKey
        : `0x${walletPrivateKey}`;
    } catch (error) {
      throw new Error(`Failed to initialize predict bot: ${error}`);
    }
  }

  private async initializeOrderBuilder() {
    const signer = new Wallet(this.walletPrivateKey!);
    this.signer = signer;
    this.logger.log(`Signer address: ${signer.address}`);

    // Create a new instance of the OrderBuilder class. Note: This should only be done once per signer
    this.logger.log('Connecting to BSC network...');
    this.orderBuilder = await OrderBuilder.make(ChainId.BnbMainnet, signer, {
      predictAccount: this.predictAccount!,
    });
    if (!this.orderBuilder) {
      throw new Error('OrderBuilder not initialized');
    }
    this.logger.log('OrderBuilder initialized successfully');
  }

  private async initializeCategories() {
    const categories = await this.getDefaultMarkets();
    this.categories = filterAndSortCryptoUpDownCategories(categories.data);
  }

  private async initializeCategoryTable() {
    // TODO: Check if this is relevant. Perhaps its not needed.
    this.filteredCategories = this.categories.filter((category) =>
      targetSlugs.includes(category.slug),
    );

    if (this.categories.length > 0) {
      console.log(
        '================================================== Categories Table ========================================',
      );
      const tableData = this.categories.map((category) => ({
        title: category.title,
        slug: category.slug,
        // startsAt: category.startsAt, // NOTE: you can display to see the date and time
      }));

      console.table(tableData);
      console.log(
        '================================================== Categories Table ========================================',
      );

      const categoriesForDisplay =
        this.filteredCategories.length > 0
          ? this.filteredCategories
          : this.categories;

      for (const category of categoriesForDisplay) {
        if (category.markets.length > 0) {
          console.log(`-- Markets for category: ${category.title} --\n`);
          // Process markets in batches to avoid rate limiting
          const batchSize = 5;
          const marketTable = [];

          for (let i = 0; i < category.markets.length; i += batchSize) {
            const batch = category.markets.slice(i, i + batchSize);
            const batchResults = await Promise.all(
              batch.map(async (market) => {
                try {
                  const stats = await this.getMarketStatistics(market.id);
                  return {
                    id: market.id,
                    slug: market.categorySlug,
                    // question: market.question,
                    status: market.status,
                    outcomes: market.outcomes
                      .map((outcome) => {
                        const outcomeStatus = outcome.status ?? 'PENDING';
                        return `${outcome.name} (${outcomeStatus})`;
                      })
                      .join(', '),
                    liquidity: stats.data.totalLiquidityUsd,
                    volume: stats.data.volumeTotalUsd,
                  };
                } catch (error) {
                  this.logger.warn(
                    `Failed to fetch statistics for market ${market.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  );
                  return {
                    id: market.id,
                    slug: market.categorySlug,
                    question: market.question,
                    status: market.status,
                    outcomes: market.outcomes
                      .map((outcome) => {
                        const outcomeStatus = outcome.status ?? 'PENDING';
                        return `${outcome.name} (${outcomeStatus})`;
                      })
                      .join(', '),
                    liquidity: 'N/A',
                    volume: 'N/A',
                  };
                }
              }),
            );
            marketTable.push(...batchResults);

            // Add a small delay between batches to avoid rate limiting
            if (i + batchSize < category.markets.length) {
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
          }

          console.log(
            '================================================== Category Markets Table ========================================',
          );
          console.table(marketTable);

          // Calculate total liquidity for markets that have liquidity
          const totalLiquidity = marketTable
            .filter((market) => typeof market.liquidity === 'number')
            .reduce((sum, market) => sum + (market.liquidity as number), 0);

          // Calculate total volume for markets that have volume
          const totalVolume = marketTable
            .filter((market) => typeof market.volume === 'number')
            .reduce((sum, market) => sum + (market.volume as number), 0);

          console.log(`Total liquidity: ${totalLiquidity.toFixed(2)} USD`);
          console.log(`Total Volume: ${totalVolume.toFixed(2)} USD`);
        } else {
          console.log(`-- No markets for category: ${category.title}`);
        }
      }
      console.log(
        '================================================== Category Markets Table ========================================',
      );
    } else {
      this.logger.log('No categories found');
    }
  }

  private async initializePositionTable() {
    const userPositions = await this.getAllPositions();
    this.positions = userPositions.data;

    if (this.positions.length > 0) {
      console.log(
        '================================================== Positions Table ========================================',
      );
      const tableData = this.positions.map((position) => ({
        id: position.market.id,
        title: position.market.title,
        shares: formatEther(position.amount),
        usd: `$${parseFloat(position.valueUsd).toFixed(2)}`,
      }));

      console.table(tableData);
      console.log(
        '================================================== Positions Table ========================================',
      );
    } else {
      this.logger.log('No positions found');
    }
  }

  private async initializeMarketTrade() {
    const categoriesForTrade =
      this.filteredCategories.length > 0
        ? this.filteredCategories
        : this.categories;

    if (!categoriesForTrade.length) {
      this.logger.warn(
        'No categories with markets available for trade creation',
      );
      return;
    }

    for (const category of categoriesForTrade) {
      if (!category.markets.length) {
        continue;
      }

      let counter = 0;
      for (const selectedMarket of category.markets) {
        if (counter >= 1) break;
        counter++;
        this.logger.log(`Selected market: ${selectedMarket.id}`);

        const tradeConfig =
          this.tradeConfigsByMarketVariant.get(category.marketVariant) ?? null;
        const tradeAmount = tradeConfig?.amount ?? 1;

        const marketTrade: SaveMarketTradeInput = {
          marketId: selectedMarket.id,
          slug: selectedMarket.categorySlug,
          amount: tradeAmount,
          timestamp: new Date(),
          status: TradeStatus.BOUGHT,
        };
        await this.createMarketTrade(marketTrade);
      }
    }
  }

  // NOTE: This function is used to initialize the JWT authorization.
  // It does not return a response but assigns value to class scoped variables.
  // If we want to make it as a service, return a response for the authorization.
  private async initializeJWTAuthorization() {
    try {
      const headers = new Headers();
      headers.append('x-api-key', this.apiKey!);

      const getRequestOptions: RequestInit = {
        method: 'GET',
        headers: headers,
        redirect: 'follow' as RequestRedirect,
      };

      const messageResponse = await fetchWithRetry(
        `${this.baseUrl!}/auth/message`,
        getRequestOptions,
        this.logger,
      );

      const responseData =
        (await messageResponse.json()) as AuthMessageResponse;
      const signature = await this.orderBuilder!.signPredictAccountMessage(
        responseData.data.message,
      );

      const raw = JSON.stringify({
        signer: this.predictAccount!,
        signature: signature,
        message: responseData.data.message,
      });

      const postRequestOptions: RequestInit = {
        method: 'POST',
        headers: headers,
        body: raw,
        redirect: 'follow' as RequestRedirect,
      };

      const authResponse = await fetchWithRetry(
        `${this.baseUrl!}/auth`,
        postRequestOptions,
        this.logger,
      );

      const authData = (await authResponse.json()) as AuthResponse;
      this.token = authData.data.token;
      this.logger.log('JWT authorization successful');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to authenticate: ${error.message}`);
      }
      throw new Error('Failed to authenticate: Unknown error');
    }
  }

  async getUSDTBalance(): Promise<BalanceResponse> {
    let signerBalanceInWei: bigint = 0n;
    let predictAccountBalanceInWei: bigint = 0n;
    try {
      signerBalanceInWei = await this.orderBuilder!.balanceOf();

      if (!this.orderBuilder!.contracts) {
        return {
          signerBalance: formatUnits(signerBalanceInWei, 18),
          predictAccountBalance: '0.0',
        };
      }

      predictAccountBalanceInWei = await this.orderBuilder!.contracts[
        'USDT'
      ].contract.balanceOf(this.predictAccount!);
    } catch (error) {
      this.logger.warn(
        `Failed to get USDT balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      this.logger.log(
        `Signer balance: ${formatUnits(signerBalanceInWei ?? 0n, 18)} USDT`,
      );
      this.logger.log(
        `Predict Account balance: ${formatUnits(predictAccountBalanceInWei ?? 0n, 18)} USDT`,
      );
    }

    return {
      signerBalance: formatUnits(signerBalanceInWei, 18),
      predictAccountBalance: formatUnits(predictAccountBalanceInWei, 18),
    };
  }

  async getAllMarkets(): Promise<GetAllMarketsResponse> {
    let data: GetAllMarketsResponse | null = null;

    try {
      const headers = new Headers();
      headers.append('x-api-key', this.apiKey!);

      const requestOptions = {
        method: 'GET',
        headers: headers,
        redirect: 'follow',
      };

      const response = await fetch(
        `${this.baseUrl!}/markets`,
        requestOptions as RequestInit,
      );
      if (!response.ok) {
        throw new Error(
          `Failed to get markets: HTTP ${response.status} ${response.statusText}`,
        );
      }

      data = (await response.json()) as GetAllMarketsResponse;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch markets: ${error.message}`);
      }
      throw new Error('Failed to fetch markets: Unknown error');
    } finally {
      this.logger.log(`Total Predict Markets: ${data?.data.length ?? 0}`);
    }

    if (!data) {
      throw new Error('Failed to retrieve markets data');
    }

    return data;
  }

  async getDefaultMarkets(): Promise<GetCategoriesByResponse> {
    let data: GetCategoriesByResponse | null = null;
    let categories: Category[] = [];

    try {
      const headers = new Headers();
      headers.append('x-api-key', this.apiKey!);

      const requestOptions = {
        method: 'GET',
        headers: headers,
        redirect: 'follow',
      };

      const response = await fetch(
        `${this.baseUrl!}/categories?status=OPEN`,
        requestOptions as RequestInit,
      );
      if (!response.ok) {
        throw new Error(
          `Failed to get categories: HTTP ${response.status} ${response.statusText}`,
        );
      }

      data = (await response.json()) as GetCategoriesByResponse;
      categories = data.data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch categories: ${error.message}`);
      }
      throw new Error('Failed to fetch categories: Unknown error');
    } finally {
      this.logger.log(`Total Default Categories: ${categories.length ?? 0}`);
    }

    return data;
  }

  async getAllPositions(): Promise<GetAllPositionsResponse> {
    let data: GetAllPositionsResponse | null = null;
    let positions: Position[] = [];

    try {
      const headers = new Headers();
      headers.append('x-api-key', this.apiKey!);
      headers.append('Authorization', `Bearer ${this.token!}`);

      const requestOptions = {
        method: 'GET',
        headers: headers,
        redirect: 'follow',
      };

      const response = await fetch(
        `${this.baseUrl!}/positions`,
        requestOptions as RequestInit,
      );
      if (!response.ok) {
        throw new Error(
          `Failed to get positions: HTTP ${response.status} ${response.statusText}`,
        );
      }

      data = (await response.json()) as GetAllPositionsResponse;
      positions = data.data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch positions: ${error.message}`);
      }
      throw new Error('Failed to fetch positions: Unknown error');
    } finally {
      this.logger.log(`Total Positions: ${positions.length}`);
    }

    if (positions.length === 0) {
      this.logger.warn('No positions found');
    }

    return data;
  }

  async getMarketStatistics(
    marketId: number,
  ): Promise<GetMarketStatisticsResponse> {
    let data: GetMarketStatisticsResponse | null = null;
    let statistics: MarketStatistics | null = null;

    try {
      const headers = new Headers();
      headers.append('x-api-key', this.apiKey!);

      const requestOptions = {
        method: 'GET',
        headers: headers,
        redirect: 'follow',
      };

      const response = await fetch(
        `${this.baseUrl!}/markets/${marketId}/stats`,
        requestOptions as RequestInit,
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      data = (await response.json()) as GetMarketStatisticsResponse;
      statistics = data.data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch market statistics: ${error.message}`);
      }
      throw new Error('Failed to fetch market statistics: Unknown error');
    }
    return data;
  }

  async getMarketById(marketId: number): Promise<MarketDataResponse> {
    let data: MarketDataResponse | null = null;
    let market: Market | null = null;

    try {
      const headers = new Headers();
      headers.append('x-api-key', this.apiKey!);
      const requestOptions = {
        method: 'GET',
        headers: headers,
        redirect: 'follow',
      };

      const response = await fetch(
        `${this.baseUrl!}/markets/${marketId}`,
        requestOptions as RequestInit,
      );
      if (!response.ok) {
        throw new Error(
          `Failed to get market by id: HTTP ${response.status} ${response.statusText}`,
        );
      }
      data = (await response.json()) as MarketDataResponse;
      market = data.data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch market by id: ${error.message}`);
      }
      throw new Error('Failed to fetch market by id: Unknown error');
    } finally {
      this.logger.log(`Market found, id: ${market?.id ?? 'N/A'}`);
    }
    return data;
  }

  async getOrderBookByMarketId(
    marketId: number,
  ): Promise<GetOrderBookResponse> {
    let data: GetOrderBookResponse | null = null;
    let orderBook: OrderBookData | null = null;

    try {
      const headers = new Headers();
      headers.append('x-api-key', this.apiKey!);

      const requestOptions = {
        method: 'GET',
        headers: headers,
        redirect: 'follow',
      };

      const response = await fetch(
        `${this.baseUrl!}/markets/${marketId}/orderbook`,
        requestOptions as RequestInit,
      );

      data = (await response.json()) as GetOrderBookResponse;
      orderBook = data.data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch order book: ${error.message}`);
      }
      throw new Error('Failed to fetch order book: Unknown error');
    } finally {
      this.logger.log(`Order book found, id: ${orderBook?.marketId ?? 'N/A'}`);
    }
    return data;
  }

  async getTradeConfigByMarketVariant(
    marketVariant: MarketVariant,
  ): Promise<TradeConfig | null> {
    const cached = this.tradeConfigsByMarketVariant.get(marketVariant);
    if (cached) {
      return cached;
    }
    return this.predictRepository.getTradeConfigByMarketVariant(marketVariant);
  }

  private async initializeTradeConfigs() {
    const tradeConfigs = await this.predictRepository.getAllTradeConfigs();
    this.tradeConfigsByMarketVariant = new Map(
      tradeConfigs.map((tradeConfig) => [
        tradeConfig.marketVariant,
        tradeConfig,
      ]),
    );
  }

  async setApprovals(): Promise<SetApprovalsResult | void> {
    let result: SetApprovalsResult | null = null;

    try {
      const selectedWalletApproval =
        await this.predictRepository.getWalletApprovalByWalletAddress(
          this.predictAccount!,
        );
      if (selectedWalletApproval) {
        this.logger.log(
          `Wallet approvals already set for ${this.predictAccount!}.`,
        );
        return;
      }

      // NOTE: You can also call `setApprovals` once per wallet.
      result = await this.orderBuilder!.setApprovals();
      if (!result.success) throw new Error('Failed to set approvals.');

      const walletApproval = await this.saveWalletApprovals();
      if (!walletApproval) throw new Error('Failed to save wallet approvals.');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to set approvals: ${error.message}`);
      }
      throw new Error('Failed to set approvals: Unknown error');
    }

    return result;
  }

  async saveWalletApprovals() {
    let walletApproval: WalletApproval | null = null;
    try {
      walletApproval = await this.predictRepository.saveWalletApprovals(
        this.predictAccount!,
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to save wallet approvals: ${error.message}`);
      }
      throw new Error('Failed to save wallet approvals: Unknown error');
    } finally {
      this.logger.log(
        `Wallet approvals saved, id: ${walletApproval?.id ?? 'N/A'}`,
      );
    }

    return walletApproval;
  }

  async createOrder(
    createOrderBody: CreateOrderBody,
  ): Promise<CreateOrderResponse> {
    let data: CreateOrderResponse | null = null;
    let createOrderResponse: CreateOrderResponse | null = null;

    try {
      const headers = new Headers();
      headers.append('x-api-key', this.apiKey!);
      headers.append('Authorization', `Bearer ${this.token}`);

      const requestOptions = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(createOrderBody),
        redirect: 'follow',
      };

      const response = await fetch(
        `${this.baseUrl!}/orders`,
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

  async createMarketTrade(market: SaveMarketTradeInput): Promise<Trade | void> {
    const { marketId } = market;
    const { data: book } = await this.getOrderBookByMarketId(marketId);
    const trade = await this.predictRepository.getTradeByMarketId(marketId);
    if (trade) {
      this.logger.warn(`Trade already exists. Market ID: ${marketId}`);
      return;
    }

    const marketData = await this.getMarketById(marketId);

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
    const outcomeOnChainId =
      marketData.data.outcomes[chosenOutcomeIndex].onChainId;

    const normalizedBook = {
      ...book,
      asks: normalizeDepth(book.asks),
      bids: normalizeDepth(book.bids),
    };

    const { lastPrice, pricePerShare, makerAmount, takerAmount } =
      this.orderBuilder!.getMarketOrderAmounts(
        {
          side: Side.BUY,
          quantityWei: parseEther(market.amount.toString()),
        },
        normalizedBook, // It's recommended to re-fetch the orderbook regularly to avoid issues
      );

    if (pricePerShare <= 0n) {
      this.logger.warn('Price per share is less than or equal to 0');
      return;
    }

    const order = this.orderBuilder!.buildOrder(OrderStrategy.MARKET, {
      maker: this.signer!.address,
      signer: this.signer!.address,
      side: Side.BUY,
      tokenId: outcomeOnChainId,
      makerAmount: makerAmount,
      takerAmount: takerAmount,
      feeRateBps: marketData.data.feeRateBps,
    });

    const typedData = this.orderBuilder!.buildTypedData(order, {
      isNegRisk: marketData.data.isNegRisk,
      isYieldBearing: marketData.data.isYieldBearing,
    });
    const signedOrder = await this.orderBuilder!.signTypedDataOrder(typedData);
    const hash = await this.orderBuilder!.buildTypedDataHash(typedData);

    const createOrderBody: CreateOrderBody = {
      data: {
        pricePerShare: pricePerShare.toString(),
        strategy: TradeStrategy.MARKET,
        slippageBps: '200', // Only used for `MARKET` orders, in this example it's 2%
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

    const createOrderResponse = await this.createOrder(createOrderBody);
    if (!createOrderResponse.success) {
      this.logger.warn(
        `Failed to create order: ${createOrderResponse.error!._tag}`,
      );
      return;
    }

    market.transactionHash =
      createOrderResponse.data?.orderHash ?? ZeroHash.toString();
    return this.predictRepository.saveMarketTrade(market);
  }
}
