import { ConfigService } from '@nestjs/config';
import { Category, MarketVariant } from 'src/predict/types/market.types';
import { parseBooleanFlag } from 'src/lib/utils/boolean';
import { Channel, RealtimeTopic } from 'src/predict/types/websocket.types';
import { RefreshLoopDeps, RefreshLoopState } from 'src/predict/types/bot.types';
import {
  AUTO_TRADE_INTERVAL_MS,
  CATEGORY_REFRESH_INTERVAL_MS,
} from 'src/lib/helpers/constants';

function getCategoryRefreshIntervalMs(configService: ConfigService): number {
  const raw = configService.get<string>('PREDICT_CATEGORY_REFRESH_INTERVAL_MS');
  if (!raw || raw.trim() === '') {
    return CATEGORY_REFRESH_INTERVAL_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : CATEGORY_REFRESH_INTERVAL_MS;
}

function getAutoTradeIntervalMs(configService: ConfigService): number {
  const raw = configService.get<string>('PREDICT_WS_AUTO_TRADE_INTERVAL_MS');
  if (!raw || raw.trim() === '') {
    return AUTO_TRADE_INTERVAL_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : AUTO_TRADE_INTERVAL_MS;
}

function getLimitLossPercentage(configService: ConfigService): number | null {
  const raw = configService.get<string>('PREDICT_LIMIT_LOSS_PERCENTAGE');
  if (!raw || raw.trim() === '') {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    return null;
  }
  return parsed;
}

function isWebsocketAutoTradeEnabled(configService: ConfigService): boolean {
  const raw = configService.get<string>('PREDICT_WS_AUTO_TRADE');
  if (!raw || raw.trim() === '') {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function isBotEnabled(configService: ConfigService): boolean {
  return parseBooleanFlag(configService.get<string>('PREDICT_BOT_ENABLED'));
}

function isWebsocketEnabled(configService: ConfigService): boolean {
  return parseBooleanFlag(configService.get<string>('PREDICT_WS_ENABLED'));
}

function filterAndSortCryptoUpDownCategories(
  categories: Category[],
): Category[] {
  return categories
    .filter(
      (category) => category.marketVariant === MarketVariant.CRYPTO_UP_DOWN,
    )
    .sort((a, b) => {
      const dateA = new Date(a.startsAt).getTime();
      const dateB = new Date(b.startsAt).getTime();
      return dateB - dateA; // Descending order (newest first)
    });
}

async function refreshCategoriesAndSubscribe(
  deps: RefreshLoopDeps,
  state: RefreshLoopState,
  categories: {
    list: Category[];
    set: (next: Category[]) => void;
  },
  getDefaultMarkets: () => Promise<{ data: Category[] }>,
  filterAndSort: (data: Category[]) => Category[],
  subscribeToOrderbook: (marketId: number) => void,
  onUpdated?: (updated: Category[]) => void | Promise<void>,
): Promise<void> {
  if (state.inFlight) {
    return;
  }
  state.inFlight = true;
  try {
    const previousMarketIds = new Set(
      categories.list.flatMap((category) =>
        category.markets.map((market) => market.id),
      ),
    );
    const categoriesResponse = await getDefaultMarkets();
    const updatedCategories = filterAndSort(categoriesResponse.data);
    categories.set(updatedCategories);

    const newMarkets = updatedCategories
      .flatMap((category) => category.markets)
      .filter((market) => !previousMarketIds.has(market.id));

    for (const market of newMarkets) {
      subscribeToOrderbook(market.id);
    }

    if (newMarkets.length > 0) {
      deps.logger.log(
        `Discovered ${newMarkets.length} new markets; subscribed to orderbooks.`,
      );
    }

    if (onUpdated) {
      await onUpdated(updatedCategories);
    }
  } catch (error) {
    deps.logger.warn(
      `Failed to refresh categories: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    );
  } finally {
    state.inFlight = false;
  }
}

function startCategoryRefreshLoop(
  deps: RefreshLoopDeps,
  state: RefreshLoopState,
  refreshCategoriesAndSubscribe: () => Promise<void>,
): NodeJS.Timeout | null {
  if (state.intervalId) {
    return state.intervalId;
  }
  const intervalMs = getCategoryRefreshIntervalMs(deps.configService);
  state.intervalId = setInterval(() => {
    void refreshCategoriesAndSubscribe();
  }, intervalMs);
  return state.intervalId;
}

function startPositionsRefreshLoop(
  deps: RefreshLoopDeps,
  state: RefreshLoopState,
  refreshPositionsTable: () => Promise<void>,
): NodeJS.Timeout | null {
  if (state.intervalId) {
    return state.intervalId;
  }
  const intervalMs = getCategoryRefreshIntervalMs(deps.configService);
  state.intervalId = setInterval(() => {
    void refreshPositionsTable();
  }, intervalMs);
  return state.intervalId;
}

async function refreshPositionsTable(
  deps: RefreshLoopDeps,
  state: RefreshLoopState,
  initializePositionTable: () => Promise<void>,
): Promise<void> {
  if (state.inFlight) {
    return;
  }
  state.inFlight = true;
  try {
    await initializePositionTable();
  } catch (error) {
    deps.logger.warn(
      `Failed to refresh positions: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    );
  } finally {
    state.inFlight = false;
  }
}

function getTopicLabel(topic: Channel): string {
  switch (topic.name) {
    case RealtimeTopic.PredictOrderbook:
      return `predictOrderbook/${topic.marketId}`;
    case RealtimeTopic.AssetPriceUpdate:
      return `assetPriceUpdate/${topic.priceFeedId}`;
    case RealtimeTopic.PredictWalletEvents:
      return 'predictWalletEvents/<jwt>';
  }
}

export {
  getCategoryRefreshIntervalMs,
  getAutoTradeIntervalMs,
  getLimitLossPercentage,
  isWebsocketAutoTradeEnabled,
  isBotEnabled,
  isWebsocketEnabled,
  filterAndSortCryptoUpDownCategories,
  refreshCategoriesAndSubscribe,
  startCategoryRefreshLoop,
  startPositionsRefreshLoop,
  refreshPositionsTable,
  getTopicLabel,
};
