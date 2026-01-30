import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
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
import {
  MarketVariant,
  Trade,
  TradeConfig,
  TradeStatus,
  WalletApproval,
} from 'generated/prisma/client';
import { BalanceResponse } from 'src/predict/types/balance.types';
import {
  Category,
  Position,
  MarketStatus,
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
  RedeemPositionParams,
} from 'src/predict/types/market.types';
import {
  AuthMessageResponse,
  AuthResponse,
} from 'src/predict/types/auth.types';
import { PredictRepository } from 'src/predict/predict.repository';
import { fetchWithRetry } from 'src/lib/utils/http';
import { getComplement, normalizeDepth } from 'src/lib/utils/orderbook';
import {
  getTopicLabel as getTopicLabelHelper,
  getAutoTradeIntervalMs as getAutoTradeIntervalMsHelper,
  isWebsocketAutoTradeEnabled as isWebsocketAutoTradeEnabledHelper,
  isBotEnabled,
  isWebsocketEnabled,
  filterAndSortCryptoUpDownCategories,
  refreshPositionsTable as refreshPositionsTableHelper,
  refreshCategoriesAndSubscribe as refreshCategoriesAndSubscribeHelper,
  startCategoryRefreshLoop as startCategoryRefreshLoopHelper,
  startPositionsRefreshLoop as startPositionsRefreshLoopHelper,
} from 'src/lib/helpers/bot';
import { WebsocketService } from 'src/predict/websocket.service';
import {
  AssetPriceUpdate,
  Channel,
  PredictOrderbook,
  PredictWalletEvents,
  RealtimeTopic,
} from 'src/predict/types/websocket.types';
import { AUTO_TRADE_INTERVAL_MS, REFERRAL_CODE, SLIPPAGE_BPS } from 'src/lib/helpers/constants';

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private baseUrl: string | undefined;
  private apiKey: string | undefined;
  private predictAccount: string | undefined;
  private walletPrivateKey: string | undefined;
  private signer: Wallet | null = null;
  private orderBuilder: OrderBuilder | null = null;
  private token: string | null = null;
  private categories: Category[] = [];
  private positions: Position[] = [];
  private tradeConfigsByMarketVariant = new Map<MarketVariant, TradeConfig>();
  private realtimeSubscriptions: Array<{ unsubscribe: () => void }> = [];
  private readonly subscribedOrderbooks = new Set<number>();
  private readonly subscribedPriceFeeds = new Set<number>();
  private readonly lastRealtimeLogAt = new Map<string, number>();
  private readonly lastRealtimeTimestamp = new Map<string, number>();
  private readonly marketTradeInFlight = new Set<number>();
  private readonly marketTradeLastAttemptAt = new Map<number, number>();
  private categoryRefreshState: {
    intervalId: NodeJS.Timeout | null;
    inFlight: boolean;
  } = {
    intervalId: null,
    inFlight: false,
  };
  private positionsRefreshState: {
    intervalId: NodeJS.Timeout | null;
    inFlight: boolean;
  } = {
    intervalId: null,
    inFlight: false,
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly predictRepository: PredictRepository,
    private readonly predictRealtimeService: WebsocketService,
  ) {}

  async onModuleInit() {
    if (!isBotEnabled(this.configService)) {
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
    this.logger.log('Setting referral code...');
    await this.setReferralCode();
    this.logger.log('Predict bot setup completed successfully');
    this.logger.log('Searching markets...');
    await this.getAllMarkets();
    this.logger.log('Searching categories...');
    await this.initializeCategories();
    this.logger.log('Loading trade configs...');
    await this.initializeTradeConfigs();
    await this.initializeCategoryTable();
    this.logger.log('Checking for positions...');
    await this.initializePositionTable();
    this.logger.log('Setting approvals...');
    await this.setApprovals();
    this.logger.log('Initializing wallet events subscriptions...');
    await this.initializeWalletEventsSubscriptions();
    this.startCategoryRefreshLoop();
    this.startPositionsRefreshLoop();
  }

  onModuleDestroy() {
    if (this.categoryRefreshState.intervalId) {
      clearInterval(this.categoryRefreshState.intervalId);
      this.categoryRefreshState.intervalId = null;
    }
    if (this.positionsRefreshState.intervalId) {
      clearInterval(this.positionsRefreshState.intervalId);
      this.positionsRefreshState.intervalId = null;
    }
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

  private startCategoryRefreshLoop(): void {
    this.categoryRefreshState.intervalId = startCategoryRefreshLoopHelper(
      { configService: this.configService, logger: this.logger },
      this.categoryRefreshState,
      () => this.refreshCategoriesAndSubscribe(),
    );
  }

  private startPositionsRefreshLoop(): void {
    this.positionsRefreshState.intervalId = startPositionsRefreshLoopHelper(
      { configService: this.configService, logger: this.logger },
      this.positionsRefreshState,
      () => this.refreshPositionsTable(),
    );
  }

  private async refreshPositionsTable(): Promise<void> {
    await refreshPositionsTableHelper(
      { configService: this.configService, logger: this.logger },
      this.positionsRefreshState,
      () => this.initializePositionTable(),
    );
  }

  private async refreshCategoriesAndSubscribe(): Promise<void> {
    await refreshCategoriesAndSubscribeHelper(
      { configService: this.configService, logger: this.logger },
      this.categoryRefreshState,
      {
        list: this.categories,
        set: (next) => {
          this.categories = next;
        },
      },
      () => this.getDefaultMarkets(),
      (data) => filterAndSortCryptoUpDownCategories(data),
      (marketId) => this.subscribeToOrderbook(marketId),
      async () => {
        this.logger.log(
          `Refreshed categories @ ${new Date().toISOString()}; logging tables.`,
        );
        await this.logCategoryTables({ subscribeToMarkets: false });
      },
    );
  }

  private async initializeCategoryTable() {
    await this.logCategoryTables({ subscribeToMarkets: true });
  }

  private async logCategoryTables(options?: {
    categories?: Category[];
    subscribeToMarkets?: boolean;
  }): Promise<void> {
    const categories = options?.categories ?? this.categories;
    const shouldSubscribe = options?.subscribeToMarkets ?? false;

    if (categories.length === 0) {
      this.logger.log('No categories found');
      return;
    }

    console.log(
      '================================================== Categories Table ========================================',
    );
    const tableData = categories.map((category) => ({
      title: category.title,
      slug: category.slug,
      // startsAt: category.startsAt, // NOTE: you can display to see the date and time
    }));

    console.table(tableData);
    console.log(
      '================================================== Categories Table ========================================',
    );

    console.log(
      '================================================== Category Markets Table ========================================',
    );
    for (const category of categories) {
      if (category.markets.length > 0) {
        console.log(`-- Markets for category: ${category.title} --\n`);
        if (shouldSubscribe) {
          for (const market of category.markets) {
            this.subscribeToOrderbook(market.id);
          }
        }
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

        console.table(marketTable);
      } else {
        console.log(`-- No markets for category: ${category.title}`);
      }
    }
    console.log(
      '================================================== Category Markets Table ========================================',
    );
  }

  private async initializePositionTable() {
    const userPositions = await this.getAllPositions();
    this.positions = userPositions.data;

    if (this.positions.length > 0) {
      for (const position of this.positions) {
        if (position.market.status !== MarketStatus.RESOLVED) {
          continue;
        }

        const { indexSet } = position.outcome;
        if (indexSet !== 1 && indexSet !== 2) {
          this.logger.warn(
            `Skipping redemption for market ${position.market.id}: invalid indexSet ${indexSet}.`,
          );
          continue;
        }

        try {
          if (position.market.isNegRisk) {
            await this.redeemNegRiskPosition({
              conditionId: position.market.conditionId,
              indexSet,
              isNegRisk: position.market.isNegRisk,
              isYieldBearing: position.market.isYieldBearing,
              amount: BigInt(position.amount),
            });
          } else {
            await this.redeemStandardPosition({
              conditionId: position.market.conditionId,
              indexSet,
              isNegRisk: position.market.isNegRisk,
              isYieldBearing: position.market.isYieldBearing,
            });
          }
        } catch (error) {
          this.logger.warn(
            `Failed to redeem position for market ${position.market.id}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
        }
      }

      console.log(
        '================================================== Positions Table ========================================',
      );
      const tableData = this.positions.map((position) => ({
        id: position.market.id,
        title: position.market.title,
        outcome: position.outcome.name,
        shares: formatEther(position.amount),
        usd: `$${parseFloat(position.valueUsd).toFixed(2)}`,
        status: position.market.status,
      }));

      console.table(tableData);
      console.log(
        '================================================== Positions Table ========================================',
      );
    } else {
      this.logger.log('No positions found');
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

  private async initializeWalletEventsSubscriptions() {
    if (!isWebsocketEnabled(this.configService)) {
      this.logger.log(
        'Predict websocket is disabled via PREDICT_WS_ENABLED. Skipping realtime subscriptions.',
      );
      return;
    }

    this.predictRealtimeService.connect();

    const shouldSubscribeWalletEvents =
      this.configService
        .get<string>('PREDICT_WS_WALLET_EVENTS')
        ?.toLowerCase() === 'true';

    if (shouldSubscribeWalletEvents && this.token) {
      this.subscribeToRealtimeTopic({
        name: RealtimeTopic.PredictWalletEvents,
        jwt: this.token,
      });
      return;
    }

    this.logger.log(
      'Predict websocket enabled. Call subscribeToOrderbook or subscribeToPriceFeed with market data.',
    );
  }

  private subscribeToRealtimeTopic(topic: Channel) {
    const subscription = this.predictRealtimeService.subscribe(
      topic,
      ({ data, err }) => {
        if (err) {
          this.logger.warn(
            `Predict websocket error: ${err.code} ${err.message ?? ''}`.trim(),
          );
          return;
        }
        this.logRealtimeEvent(topic, data);
      },
    );
    this.logger.log(
      `Predict websocket subscribed: ${getTopicLabelHelper(topic)}`,
    );
    this.realtimeSubscriptions.push(subscription);
  }

  private subscribeToOrderbook(marketId: number): void {
    if (
      !isWebsocketEnabled(this.configService) ||
      this.subscribedOrderbooks.has(marketId)
    ) {
      return;
    }
    this.subscribedOrderbooks.add(marketId);
    this.subscribeToRealtimeTopic({
      name: RealtimeTopic.PredictOrderbook,
      marketId,
    });
  }

  // TODO: Implement this function to subscribe to a price feed.
  // I don't know how to get the price feed id LOL.
  private subscribeToPriceFeed(priceFeedId: number): void {
    if (
      !isWebsocketEnabled(this.configService) ||
      this.subscribedPriceFeeds.has(priceFeedId)
    ) {
      return;
    }
    this.subscribedPriceFeeds.add(priceFeedId);
    this.subscribeToRealtimeTopic({
      name: RealtimeTopic.AssetPriceUpdate,
      priceFeedId,
    });
  }

  private logRealtimeEvent(topic: Channel, data: unknown): void {
    if (!this.shouldLogRealtimeEvent(topic, data)) {
      return;
    }
    const isObjectPayload = data !== null && typeof data === 'object';
    if (topic.name === RealtimeTopic.PredictOrderbook && isObjectPayload) {
      const orderbook = data as PredictOrderbook;

      console.log(
        '================================================== Predict Orderbook ========================================',
      );
      console.table([
        {
          marketId: orderbook.marketId ?? topic.marketId,
          updateTimestampMs: orderbook.updateTimestampMs ?? 'N/A',
          orderCount: orderbook.orderCount ?? 'N/A',
          asks: Array.isArray(orderbook.asks) ? orderbook.asks.length : 'N/A',
          bids: Array.isArray(orderbook.bids) ? orderbook.bids.length : 'N/A',
        },
      ]);
      console.log(
        '================================================== Predict Orderbook ========================================',
      );
      if (orderbook.marketId !== undefined) {
        // start async work and don't wait for it to complete
        void this.createMarketTradeFromOrderbook(orderbook.marketId);
      }
      return;
    }

    if (topic.name === RealtimeTopic.AssetPriceUpdate && isObjectPayload) {
      const priceUpdate = data as AssetPriceUpdate;

      console.log(
        '================================================== Asset Price Update ========================================',
      );
      console.table([
        {
          priceFeedId: topic.priceFeedId,
          price: priceUpdate.price ?? 'N/A',
          publishTime: priceUpdate.publishTime ?? 'N/A',
          timestamp: priceUpdate.timestamp ?? 'N/A',
        },
      ]);
      console.log(
        '================================================== Asset Price Update ========================================',
      );
      return;
    }

    if (topic.name === RealtimeTopic.PredictWalletEvents && isObjectPayload) {
      const walletEvent = data as PredictWalletEvents;

      console.log(
        '================================================== Predict Wallet Event ========================================',
      );
      const reason = 'reason' in walletEvent ? walletEvent.reason : undefined;
      const kind = 'kind' in walletEvent ? walletEvent.kind : undefined;
      console.table([
        {
          type: walletEvent.type ?? 'N/A',
          orderId: walletEvent.orderId ?? 'N/A',
          timestamp: walletEvent.timestamp ?? 'N/A',
          outcome: walletEvent.details?.outcome ?? 'N/A',
          quoteType: walletEvent.details?.quoteType ?? 'N/A',
          quantity: walletEvent.details?.quantity ?? 'N/A',
          price: walletEvent.details?.price ?? 'N/A',
          strategyType: walletEvent.details?.strategyType ?? 'N/A',
          categorySlug: walletEvent.details?.categorySlug ?? 'N/A',
          reason: reason ?? 'N/A',
          kind: kind ?? 'N/A',
        },
      ]);
      console.log(
        '================================================== Predict Wallet Event ========================================',
      );
      return;
    }

    console.log(
      '====================== Predict WS Event ======================',
    );
    console.table([
      { topic: getTopicLabelHelper(topic), data: JSON.stringify(data) },
    ]);
    console.log(
      '====================== Predict WS Event ======================',
    );
  }

  private shouldLogRealtimeEvent(topic: Channel, data: unknown): boolean {
    const key = getTopicLabelHelper(topic);
    const now = Date.now();
    const minIntervalMs = Number(
      this.configService.get<string>('PREDICT_WS_LOG_INTERVAL_MS') ??
        AUTO_TRADE_INTERVAL_MS,
    );
    if (!Number.isFinite(minIntervalMs) || minIntervalMs <= 0) {
      return true;
    }

    if (
      topic.name === RealtimeTopic.PredictOrderbook &&
      data &&
      typeof data === 'object'
    ) {
      const orderbook = data as PredictOrderbook;
      const lastTimestamp = this.lastRealtimeTimestamp.get(key);
      if (orderbook.updateTimestampMs !== undefined) {
        if (lastTimestamp === orderbook.updateTimestampMs) {
          return false;
        }
        this.lastRealtimeTimestamp.set(key, orderbook.updateTimestampMs); // map (key => value) pair
      }
    }

    const lastLoggedAt = this.lastRealtimeLogAt.get(key) ?? 0;
    if (now - lastLoggedAt < minIntervalMs) {
      return false;
    }

    this.lastRealtimeLogAt.set(key, now); // update mapping
    return true;
  }

  private async createMarketTradeFromOrderbook(
    marketId: number,
  ): Promise<void> {
    if (!isWebsocketAutoTradeEnabledHelper(this.configService)) {
      return;
    }

    // TODO: check if NestJS has a better way to handle concurrent requests.
    // Go back here once done reviewing
    if (this.marketTradeInFlight.has(marketId)) {
      return;
    }

    const cooldownMs = getAutoTradeIntervalMsHelper(this.configService);
    const lastAttemptAt = this.marketTradeLastAttemptAt.get(marketId) ?? 0;
    if (cooldownMs > 0 && Date.now() - lastAttemptAt < cooldownMs) {
      return;
    }
    this.marketTradeInFlight.add(marketId);
    this.marketTradeLastAttemptAt.set(marketId, Date.now());

    try {
      const slug = this.findMarketSlugById(marketId);
      if (!slug) {
        throw new Error(`Market slug not found for marketId ${marketId}`);
      }
      const amount = this.getTradeAmountForMarketSlug(slug);
      const marketTrade: SaveMarketTradeInput = {
        marketId,
        slug,
        amount,
        timestamp: new Date(),
        status: TradeStatus.BOUGHT,
      };
      await this.createMarketTrade(marketTrade);
    } catch (error) {
      this.logger.warn(
        `Failed to auto-create market trade for ${marketId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    } finally {
      this.marketTradeInFlight.delete(marketId);
    }
  }

  private findMarketSlugById(marketId: number): string | null {
    for (const category of this.categories) {
      const market = category.markets.find((item) => item.id === marketId);
      if (market) {
        return market.categorySlug;
      }
    }
    return null;
  }

  private getTradeAmountForMarketSlug(slug: string): number {
    const category = this.categories.find((item) => item.slug === slug);
    if (!category) {
      this.logger.warn(
        `Trade amount fallback to default (1). Category not found for slug ${slug}.`,
      );
      return 1;
    }
    const tradeConfig = this.tradeConfigsByMarketVariant.get(
      category.marketVariant,
    );
    if (!tradeConfig) {
      this.logger.warn(
        `Trade amount fallback to default (1). No trade config for marketVariant ${category.marketVariant}. Slug: ${slug}. Category: ${category.slug}.`,
      );
      return 1;
    }
    this.logger.log(
      `Trade amount resolved to ${tradeConfig.amount}\n` +
        `MarketVariant: ${category.marketVariant}\n` +
        `Slug: ${slug}\n` +
        `Category: ${category.slug}`,
    );
    return tradeConfig.amount;
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

  async setReferralCode(): Promise<boolean> {
    let result: boolean = false;
    try {
      const headers = new Headers();
      headers.append('x-api-key', this.apiKey!);
      headers.append('Authorization', `Bearer ${this.token!}`);

      const requestOptions = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          referralCode: REFERRAL_CODE,
        }),
        redirect: 'follow',
      };

      const response = await fetch(
        `${this.baseUrl!}/account/referral`,
        requestOptions as RequestInit,
      );
      if (!response.ok) {
        this.logger.warn(`Failed to set referral code: HTTP ${response.status} ${response.statusText}`);
        return false;
      }
      result = (await response.json()) as boolean;
      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to set referral code: ${error.message}`);
      }
      throw new Error('Failed to set referral code: Unknown error');
    }
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
    this.subscribeToOrderbook(marketData.data.id);

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

    // NOTE: Disable this to buy tokens with price per share less than or equal to 0
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

    const createOrderResponse = await this.createOrder(createOrderBody);
    if (!createOrderResponse.success) {
      this.logger.warn(
        `Failed to create order: ${createOrderResponse.error!._tag}`,
      );
      return;
    }

    // TODO: rename transactionHash to orderHash
    market.transactionHash =
      createOrderResponse.data?.orderHash ?? ZeroHash.toString();
    return this.predictRepository.saveMarketTrade(market);
  }

  async redeemStandardPosition({
    conditionId,
    indexSet,
    isNegRisk,
    isYieldBearing,
  }: RedeemPositionParams) {
    try {
      const result = await this.orderBuilder!.redeemPositions({
        conditionId,
        indexSet,
        isNegRisk,
        isYieldBearing,
      });
      if (!result.success) {
        throw new Error(`Failed to redeem position: ${result.cause}`);
      }
      console.log('Redeem position successful', result.receipt);
      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to redeem position: ${error.message}`);
      }
      throw new Error('Failed to redeem position: Unknown error');
    }
  }

  async redeemNegRiskPosition({
    conditionId,
    indexSet,
    isNegRisk,
    isYieldBearing,
    amount,
  }: RedeemPositionParams) {
    try {
      const result = await this.orderBuilder!.redeemPositions({
        conditionId,
        indexSet,
        amount,
        isNegRisk,
        isYieldBearing,
      });
      if (!result.success) {
        throw new Error(`Failed to redeem position: ${result.cause}`);
      }
      console.log('Redeem position successful', result.receipt);
      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to redeem position: ${error.message}`);
      }
      throw new Error('Failed to redeem position: Unknown error');
    }
  }
}
