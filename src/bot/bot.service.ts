import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatEther, formatUnits, Wallet } from 'ethers';
import { OrderBuilder, ChainId } from '@predictdotfun/sdk';
import { MarketVariant } from '@prisma/client';
import { BalanceResponse } from 'src/types/balance.types';
import {
  Category,
  Position,
  MarketStatus,
  MarketStatistics,
  Market,
  OrderBookData,
  GetAllMarketsResponse,
  GetAllPositionsResponse,
  GetCategoriesByResponse,
  GetTagsResponse,
  GetMarketStatisticsResponse,
  GetOrderBookResponse,
  MarketDataResponse,
  Tag,
} from 'src/types/market.types';
import { AuthMessageResponse, AuthResponse } from 'src/types/auth.types';
import {
  PredictRepository,
  type BuyPositionConfigRecord,
  type SellPositionConfigRecord,
  type SlugMatchRuleRecord,
} from '../predict/predict.repository';
import { fetchWithRetry } from 'src/common/utils/http';
import {
  getTopicLabel as getTopicLabelHelper,
  isBotEnabled,
  isWebsocketEnabled,
  filterAndSortSupportedCategories,
  refreshPositionsTable as refreshPositionsTableHelper,
  refreshCategoriesAndSubscribe as refreshCategoriesAndSubscribeHelper,
  startCategoryRefreshLoop as startCategoryRefreshLoopHelper,
  startPositionsRefreshLoop as startPositionsRefreshLoopHelper,
  shouldLogRealtimeEvent as shouldLogRealtimeEventHelper,
  buildBuyConfigKey,
  getMarketTimeLeftMessage,
} from './bot.service.helper';
import { PredictRealtimeService } from 'src/websocket/predict-realtime.service';
import {
  AssetPriceUpdate,
  Channel,
  PredictOrderbook,
  PredictWalletEvents,
  RealtimeTopic,
} from 'src/types/websocket.types';
import { TradeService } from 'src/trade/trade.service';
import { RedeemService } from 'src/redeem/redeem.service';
import { PredictService } from 'src/predict/predict.service';
import { SUPPORTED_SLUG_KEYWORDS } from 'src/common/helpers/constants';
import {
  normalizeBuyTradeType,
  type BuyTradeType,
} from 'src/predict/buy-trade-type';

const CATEGORY_FETCH_FIRST = 100;
const CATEGORY_FETCH_SORT = 'VOLUME_24H_DESC';
const LOL_TAG_NAME = 'LoL';
const CRYPTO_TAG_NAME = 'Crypto';

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
  private buyPositionConfigsByKey = new Map<string, BuyPositionConfigRecord>();
  private sellPositionConfigsByKey = new Map<
    string,
    SellPositionConfigRecord
  >();
  private slugMatchRules: SlugMatchRuleRecord[] = [];
  private sportsBets: Array<{
    id: number;
    keyword: string;
    category: string;
    status?: 'ACTIVE' | 'INACTIVE';
  }> = [];
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
    private readonly predictRealtimeService: PredictRealtimeService,
    private readonly tradeService: TradeService,
    private readonly redeemService: RedeemService,
    private readonly predictService: PredictService,
  ) {}

  private buildVariantConfigMapKey(
    marketVariant: MarketVariant,
    configKey: string,
  ): string {
    return `${marketVariant}::${buildBuyConfigKey(configKey)}`;
  }

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
    await this.predictService.setReferralCode({
      baseUrl: this.baseUrl!,
      apiKey: this.apiKey!,
      token: this.token!,
    });
    this.logger.log('Predict bot setup completed successfully');
    this.logger.log('Searching markets...');
    await this.getAllMarkets();
    this.logger.log('Searching categories...');
    await this.initializeCategories();
    this.logger.log('Loading buy position configs...');
    await this.initializeBuyPositionConfigs();
    this.logger.log('Loading sell position configs...');
    await this.initializeSellPositionConfigs();
    this.logger.log('Loading slug match rules...');
    await this.initializeSlugMatchRules();
    this.logger.log('Loading sports bets...');
    await this.initializeSportsBets();
    await this.initializeCategoryTable();
    this.logger.log('Checking for positions...');
    await this.initializePositionTable();
    this.logger.log('Setting approvals...');
    await this.predictService.setApprovals({
      predictAccount: this.predictAccount!,
      orderBuilder: this.orderBuilder!,
    });
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

  /* ****************************************************
   * Initialize Functions
   **************************************************** */

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
    this.categories = filterAndSortSupportedCategories(categories.data);
  }

  private async initializeCategoryTable() {
    await this.logCategoryTables({ subscribeToMarkets: true });
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
            const negRiskResult =
              await this.redeemService.redeemNegRiskPosition({
                orderBuilder: this.orderBuilder!,
                conditionId: position.market.conditionId,
                indexSet,
                isNegRisk: position.market.isNegRisk,
                isYieldBearing: position.market.isYieldBearing,
                amount: BigInt(position.amount),
              });

            if (negRiskResult.success) {
              this.logger.log(
                `Redeemed negative risk position for market ${position.market.id}.`,
              );
              this.logger.log(
                `Transaction hash: ${negRiskResult.receipt?.toJSON().transactionHash}`,
              );
            }
          } else {
            const standardResult =
              await this.redeemService.redeemStandardPosition({
                orderBuilder: this.orderBuilder!,
                conditionId: position.market.conditionId,
                indexSet,
                isNegRisk: position.market.isNegRisk,
                isYieldBearing: position.market.isYieldBearing,
              });

            if (standardResult.success) {
              this.logger.log(
                `Redeemed standard position for market ${position.market.id}.`,
              );
              // NOTE: This result to undefined
              this.logger.log(
                `Transaction hash: ${standardResult.receipt?.toJSON().transactionHash}`,
              );
            }
          }
        } catch (error) {
          this.logger.warn(
            `Failed to redeem position for market ${position.market.id}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
        }
      }

      await this.evaluateProfitTaking();
      await this.evaluateStopLoss();

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
      headers.append('Content-Type', 'application/json');

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

  private async initializeBuyPositionConfigs() {
    const buyConfigs = await this.predictRepository.getAllBuyPositionConfigs();
    this.buyPositionConfigsByKey = new Map(
      buyConfigs.map((config) => [
        this.buildVariantConfigMapKey(
          config.marketVariant,
          config.slugWithSuffix,
        ),
        config,
      ]),
    );
  }

  private async initializeSellPositionConfigs() {
    const sellConfigs =
      await this.predictRepository.getAllSellPositionConfigs();
    this.sellPositionConfigsByKey = new Map(
      sellConfigs.map((config) => [
        this.buildVariantConfigMapKey(
          config.marketVariant,
          config.slugWithSuffix,
        ),
        config,
      ]),
    );
  }

  private async initializeSportsBets() {
    this.sportsBets = await this.predictRepository.getAllSportsBets();
  }

  private async initializeSlugMatchRules() {
    this.slugMatchRules = await this.predictRepository.getAllSlugMatchRules();
  }

  /* ****************************************************
   * Refresh Functions
   **************************************************** */

  private async refreshCategoriesAndSubscribe(): Promise<void> {
    const { newMarketsCount, error } =
      await refreshCategoriesAndSubscribeHelper(
        this.categoryRefreshState,
        {
          list: this.categories,
          set: (next) => {
            this.categories = next;
          },
        },
        () => this.getDefaultMarkets(),
        (data) => filterAndSortSupportedCategories(data),
        (marketId) => this.subscribeToOrderbook(marketId),
        async () => {
          this.logger.log(
            `Refreshed categories @ ${new Date().toISOString()}; logging tables.`,
          );
          await this.logCategoryTables({ subscribeToMarkets: false });
        },
      );
    if (error) {
      this.logger.warn(`Failed to refresh categories: ${error}`);
      return;
    }
    if (newMarketsCount > 0) {
      this.logger.log(
        `Discovered ${newMarketsCount} new markets; subscribed to orderbooks.`,
      );
    }
  }

  private async refreshPositionsTable(): Promise<void> {
    const { error } = await refreshPositionsTableHelper(
      this.positionsRefreshState,
      () => this.initializePositionTable(),
    );
    if (error) {
      this.logger.warn(`Failed to refresh positions: ${error}`);
    }
  }

  /* ****************************************************
   * Private Asynchronous Functions
   **************************************************** */

  private async logCategoryTables(options?: {
    categories?: Category[];
    subscribeToMarkets?: boolean;
  }): Promise<void> {
    const categories = options?.categories ?? this.categories;
    const shouldSubscribe = options?.subscribeToMarkets ?? false;
    const formatCreatedAt = (createdAt: string): string => {
      const createdAtDate = new Date(createdAt);
      if (Number.isNaN(createdAtDate.getTime())) {
        return 'Invalid date';
      }
      return createdAtDate.toLocaleString();
    };

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
              const createdAt = formatCreatedAt(market.createdAt);
              const timeLeftMessage = getMarketTimeLeftMessage(market, {
                categoryEndsAt: category.endsAt,
                preferCategoryEndsAt:
                  category.marketVariant === MarketVariant.SPORTS_TEAM_MATCH,
              });
              if (timeLeftMessage) {
                this.logger.log(timeLeftMessage);
              }
              try {
                const stats = await this.getMarketStatistics(market.id);
                return {
                  id: market.id,
                  slug: market.categorySlug,
                  // question: market.question,
                  status: market.status,
                  createdAt,
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
                  createdAt,
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

  private async evaluateStopLoss(): Promise<void> {
    await this.tradeService.evaluateStopLoss({
      positions: this.positions,
      getOrderBookByMarketId: this.getOrderBookByMarketId.bind(this),
      getMarketById: this.getMarketById.bind(this),
      subscribeToOrderbook: this.subscribeToOrderbook.bind(this),
      getStopLossPercentageForMarketSlug:
        this.getStopLossPercentageForMarketSlug.bind(this),
      getAmountPercentageForMarketSlug:
        this.getAmountPercentageForMarketSlug.bind(this),
      createOrder: (createOrderBody) =>
        this.tradeService.createOrder({
          baseUrl: this.baseUrl!,
          apiKey: this.apiKey!,
          token: this.token!,
          createOrderBody,
        }),
      orderBuilder: this.orderBuilder!,
      signer: this.signer!,
    });
  }

  private async evaluateProfitTaking(): Promise<void> {
    await this.tradeService.evaluateProfitTaking({
      positions: this.positions,
      getOrderBookByMarketId: this.getOrderBookByMarketId.bind(this),
      getMarketById: this.getMarketById.bind(this),
      subscribeToOrderbook: this.subscribeToOrderbook.bind(this),
      getAmountPercentageForMarketSlug:
        this.getAmountPercentageForMarketSlug.bind(this),
      createOrder: (createOrderBody) =>
        this.tradeService.createOrder({
          baseUrl: this.baseUrl!,
          apiKey: this.apiKey!,
          token: this.token!,
          createOrderBody,
        }),
      orderBuilder: this.orderBuilder!,
      signer: this.signer!,
    });
  }

  /* ****************************************************
   * Private Synchronous Functions
   **************************************************** */

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

  // Starts the recurring category refresh + subscription loop.
  private startCategoryRefreshLoop(): void {
    this.categoryRefreshState.intervalId = startCategoryRefreshLoopHelper(
      { configService: this.configService },
      this.categoryRefreshState,
      () => this.refreshCategoriesAndSubscribe(),
    );
  }

  // Starts the recurring positions refresh loop.
  private startPositionsRefreshLoop(): void {
    this.positionsRefreshState.intervalId = startPositionsRefreshLoopHelper(
      { configService: this.configService },
      this.positionsRefreshState,
      () => this.refreshPositionsTable(),
    );
  }

  private logRealtimeEvent(topic: Channel, data: unknown): void {
    if (
      !shouldLogRealtimeEventHelper({
        configService: this.configService,
        topic,
        data,
        lastRealtimeLogAt: this.lastRealtimeLogAt,
        lastRealtimeTimestamp: this.lastRealtimeTimestamp,
      })
    ) {
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
        void this.tradeService.createTradeFromOrderbook({
          marketId: orderbook.marketId,
          marketTradeInFlight: this.marketTradeInFlight,
          marketTradeLastAttemptAt: this.marketTradeLastAttemptAt,
          positions: this.positions,
          getMarketSlugById: this.getMarketSlugById.bind(this),
          getTradeAmountForMarketSlug:
            this.getTradeAmountForMarketSlug.bind(this),
          getEntrySecondsForMarketSlug:
            this.getEntrySecondsForMarketSlug.bind(this),
          getBuyTradeTypeForMarketSlug:
            this.getBuyTradeTypeForMarketSlug.bind(this),
          getSportsBetKeywordForMarketSlug:
            this.getSportsBetKeywordForSlug.bind(this),
          orderBuilder: this.orderBuilder!,
          signer: this.signer!,
          getOrderBookByMarketId: this.getOrderBookByMarketId.bind(this),
          getMarketById: this.getMarketById.bind(this),
          subscribeToOrderbook: this.subscribeToOrderbook.bind(this),
          requestContext: {
            baseUrl: this.baseUrl!,
            apiKey: this.apiKey!,
            token: this.token!,
          },
        });
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

  /* ****************************************************
   * Getter Functions
   **************************************************** */

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

  async getBuyPositionConfigByMarketVariant(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
  ): Promise<BuyPositionConfigRecord | null> {
    const cached = this.buyPositionConfigsByKey.get(
      this.buildVariantConfigMapKey(marketVariant, slugWithSuffix),
    );
    if (cached) {
      return cached;
    }
    return this.predictRepository.getBuyPositionConfigByMarketVariant(
      marketVariant,
      slugWithSuffix,
    );
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

  async getDefaultMarkets(): Promise<GetCategoriesByResponse> {
    let data: GetCategoriesByResponse | null = null;
    let categories: Category[] = [];

    try {
      const tags = await this.getAllTags();
      const lolTagId = this.getTagIdByName(tags, LOL_TAG_NAME);
      const cryptoTagId = this.getTagIdByName(tags, CRYPTO_TAG_NAME);

      const [sportsTeamCategories, cryptoCategories] = await Promise.all([
        this.getCategoriesByFilters({
          marketVariant: MarketVariant.SPORTS_TEAM_MATCH,
          tagIds: lolTagId ? [lolTagId] : undefined,
        }),
        this.getCategoriesByFilters({
          marketVariant: MarketVariant.CRYPTO_UP_DOWN,
          tagIds: cryptoTagId ? [cryptoTagId] : undefined,
        }),
      ]);

      const filteredSportsTeamCategories = sportsTeamCategories.filter(
        (category) =>
          category.slug.startsWith('lol-') ||
          (lolTagId !== null && this.categoryHasTagId(category, lolTagId)),
      );
      const combinedCategories = [
        ...filteredSportsTeamCategories,
        ...cryptoCategories,
      ];
      const dedupedCategories = Array.from(
        new Map(
          combinedCategories.map((category) => [category.id, category]),
        ).values(),
      );
      data = {
        success: true,
        cursor: '',
        data: dedupedCategories,
      };
      categories = dedupedCategories;
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

  private async getAllTags(): Promise<Tag[]> {
    let data: GetTagsResponse | null = null;
    try {
      const headers = new Headers();
      headers.append('x-api-key', this.apiKey!);
      const requestOptions = {
        method: 'GET',
        headers,
        redirect: 'follow',
      };
      const response = await fetch(
        `${this.baseUrl!}/tags`,
        requestOptions as RequestInit,
      );
      if (!response.ok) {
        throw new Error(
          `Failed to get tags: HTTP ${response.status} ${response.statusText}`,
        );
      }
      data = (await response.json()) as GetTagsResponse;
      return data.data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch tags: ${error.message}`);
      }
      throw new Error('Failed to fetch tags: Unknown error');
    }
  }

  private async getCategoriesByFilters(params: {
    marketVariant: MarketVariant;
    tagIds?: string[];
  }): Promise<Category[]> {
    const categories: Category[] = [];
    let after: string | null = null;
    let previousCursor: string | null = null;

    do {
      const response = await this.fetchCategoriesPage({
        marketVariant: params.marketVariant,
        tagIds: params.tagIds,
        after,
      });
      categories.push(...response.data);
      previousCursor = after;
      after = response.cursor?.trim() ? response.cursor : null;
    } while (after && after !== previousCursor);

    return categories;
  }

  private async fetchCategoriesPage(params: {
    marketVariant: MarketVariant;
    tagIds?: string[];
    after?: string | null;
  }): Promise<GetCategoriesByResponse> {
    const headers = new Headers();
    headers.append('x-api-key', this.apiKey!);
    const requestOptions = {
      method: 'GET',
      headers,
      redirect: 'follow',
    };
    const url = new URL(`${this.baseUrl!}/categories`);
    url.searchParams.set('status', 'OPEN');
    url.searchParams.set('sort', CATEGORY_FETCH_SORT);
    url.searchParams.set('marketVariant', params.marketVariant);
    url.searchParams.set('first', String(CATEGORY_FETCH_FIRST));
    if (params.after) {
      url.searchParams.set('after', params.after);
    }
    if (params.tagIds && params.tagIds.length > 0) {
      url.searchParams.set('tagIds', JSON.stringify(params.tagIds.map(Number)));
    }

    const response = await fetch(url.toString(), requestOptions as RequestInit);
    if (!response.ok) {
      throw new Error(
        `Failed to get categories page: HTTP ${response.status} ${response.statusText}`,
      );
    }
    return (await response.json()) as GetCategoriesByResponse;
  }

  private getTagIdByName(tags: Tag[], targetName: string): string | null {
    const match = tags.find(
      (tag) => tag.name.trim().toLowerCase() === targetName.toLowerCase(),
    );
    return match ? match.id : null;
  }

  private categoryHasTagId(category: Category, tagId: string): boolean {
    return category.tags.some((tag) => tag.id === tagId);
  }

  private async getUSDTBalance(): Promise<BalanceResponse> {
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

  private async getAllMarkets(): Promise<GetAllMarketsResponse> {
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

  private async getAllPositions(): Promise<GetAllPositionsResponse> {
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

  private async getMarketStatistics(
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

  private getMarketSlugById(marketId: number): string | null {
    for (const category of this.categories) {
      const market = category.markets.find((item) => item.id === marketId);
      if (market) {
        return market.categorySlug;
      }
    }
    return null;
  }

  private getCategoryBySlug(slug: string): Category | undefined {
    return this.categories.find((item) => item.slug === slug);
  }

  private isCryptoDailySlug(slug: string): boolean {
    const normalizedSlug = slug.trim().toLowerCase();
    if (normalizedSlug.endsWith('daily')) {
      return true;
    }
    // Current API daily format example:
    // bitcoin-up-or-down-on-march-26-2026
    return /-up-or-down-on-[a-z]+-\d{1,2}-\d{4}$/.test(normalizedSlug);
  }

  private matchesSlugRule(slug: string, rule: SlugMatchRuleRecord): boolean {
    const normalizedSlug = slug.trim().toLowerCase();
    const pattern = rule.pattern.trim().toLowerCase();
    if (!pattern) {
      return false;
    }
    switch (rule.matchType) {
      case 'prefix':
        return normalizedSlug.startsWith(pattern);
      case 'suffix':
        return normalizedSlug.endsWith(pattern);
      case 'regex':
        try {
          return new RegExp(rule.pattern, 'i').test(slug);
        } catch {
          this.logger.warn(
            `Invalid slug regex rule ignored. Rule ID: ${rule.id}, pattern: ${rule.pattern}`,
          );
          return false;
        }
      default:
        return false;
    }
  }

  private resolveSupportedSlugKeyword(
    slug: string,
    marketVariant?: MarketVariant,
  ): string | null {
    if (marketVariant) {
      for (const rule of this.slugMatchRules) {
        if (rule.marketVariant !== marketVariant) {
          continue;
        }
        if (this.matchesSlugRule(slug, rule)) {
        if (rule.status === 'INACTIVE') {
          this.logger.warn(
            `Skipping slug ${slug}. Matched inactive crypto bet rule ${rule.id}.`,
          );
          return null;
        }
          return rule.configKey;
        }
      }
    }
    const hasCryptoRules = this.slugMatchRules.some(
      (rule) => rule.marketVariant === MarketVariant.CRYPTO_UP_DOWN,
    );
    if (marketVariant === MarketVariant.CRYPTO_UP_DOWN && hasCryptoRules) {
      return null;
    }
    for (const keyword of SUPPORTED_SLUG_KEYWORDS) {
      if (keyword.kind === 'suffix') {
        if (slug.endsWith(keyword.value)) {
          return keyword.value;
        }
        if (keyword.value === 'daily' && this.isCryptoDailySlug(slug)) {
          return keyword.value;
        }
      }
      if (keyword.kind === 'prefix') {
        const prefix = keyword.value.endsWith('-')
          ? keyword.value
          : `${keyword.value}-`;
        if (slug.startsWith(prefix)) {
          return keyword.value;
        }
      }
    }
    return null;
  }

  private getTradeAmountForMarketSlug(slug: string): number {
    const category = this.getCategoryBySlug(slug);
    if (!category) {
      this.logger.warn(
        `Trade amount fallback to default (1). Category not found for slug ${slug}.`,
      );
      return 1;
    }

    const supportedKeyword = this.resolveSupportedSlugKeyword(
      slug,
      category.marketVariant,
    );
    if (!supportedKeyword) {
      this.logger.warn(
        `Trade amount fallback to default (1). No supported keyword found for slug ${slug}.`,
      );
      return 1;
    }
    const buyConfig = this.buyPositionConfigsByKey.get(
      this.buildVariantConfigMapKey(category.marketVariant, supportedKeyword),
    );
    if (!buyConfig) {
      this.logger.warn(
        `Trade amount fallback to default (1). No buy position config for keyword ${supportedKeyword}. Slug: ${slug}. Category: ${category.slug}.`,
      );
      return 1;
    }
    this.logger.log(
      `Trade amount resolved to ${buyConfig.amount}\n` +
        `MarketVariant: ${category.marketVariant}\n` +
        `Slug: ${slug}\n` +
        `Category: ${category.slug}`,
    );
    return buyConfig.amount;
  }

  private getEntrySecondsForMarketSlug(slug: string): number | null {
    const category = this.getCategoryBySlug(slug);
    if (!category) {
      this.logger.warn(
        `Entry check skipped. Category not found for slug ${slug}.`,
      );
      return null;
    }
    if (
      category.marketVariant === MarketVariant.SPORTS_TEAM_MATCH &&
      !this.hasSportsBetKeywordForSlug(slug)
    ) {
      this.logger.warn(
        `Entry check skipped. No sports bet keyword matched for slug ${slug}.`,
      );
      return null;
    }
    const supportedKeyword = this.resolveSupportedSlugKeyword(
      slug,
      category.marketVariant,
    );
    if (!supportedKeyword) {
      this.logger.warn(
        `Entry check skipped. No supported keyword found for slug ${slug}.`,
      );
      return null;
    }
    const buyConfig = this.buyPositionConfigsByKey.get(
      this.buildVariantConfigMapKey(category.marketVariant, supportedKeyword),
    );
    if (!buyConfig) {
      this.logger.warn(
        `Entry check skipped. No buy position config for keyword ${supportedKeyword}. Slug: ${slug}.`,
      );
      return null;
    }
    return buyConfig.entry;
  }

  private getBuyTradeTypeForMarketSlug(slug: string): BuyTradeType {
    const category = this.getCategoryBySlug(slug);
    if (!category) {
      return normalizeBuyTradeType(undefined);
    }
    const supportedKeyword = this.resolveSupportedSlugKeyword(
      slug,
      category.marketVariant,
    );
    const buyConfig = supportedKeyword
      ? this.buyPositionConfigsByKey.get(
          this.buildVariantConfigMapKey(category.marketVariant, supportedKeyword),
        )
      : undefined;
    if (category?.marketVariant === MarketVariant.SPORTS_TEAM_MATCH) {
      return normalizeBuyTradeType(buyConfig?.tradeType, {
        defaultType: 'na',
      });
    }
    return normalizeBuyTradeType(buyConfig?.tradeType);
  }

  private hasSportsBetKeywordForSlug(slug: string): boolean {
    return this.getSportsBetKeywordForSlug(slug) !== null;
  }

  private getSportsBetKeywordForSlug(slug: string): string | null {
    if (this.sportsBets.length === 0) {
      return null;
    }
    const normalizedSlug = slug.toLowerCase();
    const match = this.sportsBets.find((bet) => {
      const category = bet.category.trim().toLowerCase();
      const keyword = bet.keyword.trim().toLowerCase();
      if (!category || !keyword) {
        return false;
      }
      const categoryPrefix = category.endsWith('-') ? category : `${category}-`;
      return (
        normalizedSlug.startsWith(categoryPrefix) &&
        normalizedSlug.includes(keyword)
      );
    });
    if (match && match.status === 'INACTIVE') {
      this.logger.warn(
        `Skipping slug ${slug}. Matched inactive sports bet ${match.id}.`,
      );
      return null;
    }
    return match ? match.keyword.trim() : null;
  }

  private getStopLossPercentageForMarketSlug(slug: string): number | null {
    const category = this.getCategoryBySlug(slug);
    if (!category) {
      return null;
    }
    if (
      category.marketVariant === MarketVariant.SPORTS_TEAM_MATCH &&
      !this.hasSportsBetKeywordForSlug(slug)
    ) {
      return null;
    }
    const supportedKeyword = this.resolveSupportedSlugKeyword(
      slug,
      category.marketVariant,
    );
    if (!supportedKeyword) {
      this.logger.warn(
        `Stop-loss check skipped. No supported keyword found for slug ${slug}.`,
      );
      return null;
    }
    const sellConfig = this.sellPositionConfigsByKey.get(
      this.buildVariantConfigMapKey(category.marketVariant, supportedKeyword),
    );
    if (!sellConfig) {
      this.logger.warn(
        `Stop-loss check skipped. No sell position config for keyword ${supportedKeyword}. Slug: ${slug}.`,
      );
      return null;
    }
    return sellConfig.stopLossPercentage;
  }

  private getAmountPercentageForMarketSlug(slug: string): number | null {
    const category = this.getCategoryBySlug(slug);
    if (!category) {
      return null;
    }
    if (
      category.marketVariant === MarketVariant.SPORTS_TEAM_MATCH &&
      !this.hasSportsBetKeywordForSlug(slug)
    ) {
      return null;
    }
    const supportedKeyword = this.resolveSupportedSlugKeyword(
      slug,
      category.marketVariant,
    );
    if (!supportedKeyword) {
      this.logger.warn(
        `Amount percentage check skipped. No supported keyword found for slug ${slug}.`,
      );
      return null;
    }
    const sellConfig = this.sellPositionConfigsByKey.get(
      this.buildVariantConfigMapKey(category.marketVariant, supportedKeyword),
    );
    if (!sellConfig) {
      this.logger.warn(
        `Amount percentage check skipped. No sell position config for keyword ${supportedKeyword}. Slug: ${slug}.`,
      );
      return null;
    }
    return sellConfig.amountPercentage;
  }
}
