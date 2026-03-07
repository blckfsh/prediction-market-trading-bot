import { ConfigService } from '@nestjs/config';
import { parseEther, WeiPerEther } from 'ethers';
import { AUTO_TRADE_INTERVAL_MS } from 'src/common/helpers/constants';
import { Position } from 'src/types/market.types';
import type { BuyTradeType } from 'src/predict/buy-trade-type';

type TradeEntry = {
  status: string;
  buyAmountInUsd: number | string | { toString(): string };
  buyTimestamp: Date | string;
};

export function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getAutoTradeIntervalMs(
  configService: ConfigService,
): number {
  const raw = configService.get<string>('PREDICT_WS_AUTO_TRADE_INTERVAL_MS');
  if (!raw || raw.trim() === '') {
    return AUTO_TRADE_INTERVAL_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : AUTO_TRADE_INTERVAL_MS;
}

export const isPositionReachedThreshold = (params: {
  entryValueUsd: number;
  currentValueUsd: number;
  stopLossPercentage: number;
}): boolean => {
  const { entryValueUsd, currentValueUsd, stopLossPercentage } = params;
  if (!Number.isFinite(entryValueUsd) || entryValueUsd <= 0) {
    return false;
  }
  if (!Number.isFinite(currentValueUsd)) {
    return false;
  }
  if (!Number.isFinite(stopLossPercentage) || stopLossPercentage < 0) {
    return false;
  }
  const lossPercentage =
    ((entryValueUsd - currentValueUsd) / entryValueUsd) * 100;
  return lossPercentage >= stopLossPercentage;
};

export const isPositionReachedProfitThreshold = (params: {
  entryValueUsd: number;
  currentValueUsd: number;
  profitTakingPercentage: number;
}): boolean => {
  const { entryValueUsd, currentValueUsd, profitTakingPercentage } = params;
  if (!Number.isFinite(entryValueUsd) || entryValueUsd <= 0) {
    return false;
  }
  if (!Number.isFinite(currentValueUsd)) {
    return false;
  }
  if (!Number.isFinite(profitTakingPercentage) || profitTakingPercentage <= 0) {
    return false;
  }
  const profitPercentage =
    ((currentValueUsd - entryValueUsd) / entryValueUsd) * 100;
  return profitPercentage >= profitTakingPercentage;
};

export const getLimitOrderPricing = (params: {
  rawTargetPrice: number;
  decimalPrecision?: number | null;
  feeRateBps: number;
}): {
  targetPrice: number;
  pricePerShareWei: bigint;
  maxPayoutPerShareWei: bigint;
} => {
  const precision = params.decimalPrecision ?? 2;
  const targetPrice = Number(params.rawTargetPrice.toFixed(precision));
  const pricePerShareWei = parseEther(targetPrice.toString());
  const feeRateBps = BigInt(params.feeRateBps);
  const oneHundredPercent = 10000n;
  const maxPayoutPerShareWei =
    (WeiPerEther * (oneHundredPercent - feeRateBps)) / oneHundredPercent;
  return { targetPrice, pricePerShareWei, maxPayoutPerShareWei };
};

export const getLimitOrderProfit = (params: {
  budgetInWei: bigint;
  pricePerShareWei: bigint;
  maxPayoutPerShareWei: bigint;
}): {
  quantityWei: bigint;
  expectedPayoutWei: bigint;
  expectedProfitWei: bigint;
} => {
  const { budgetInWei, pricePerShareWei, maxPayoutPerShareWei } = params;
  const quantityWei = (budgetInWei * WeiPerEther) / pricePerShareWei;
  const expectedPayoutWei = (quantityWei * maxPayoutPerShareWei) / WeiPerEther;
  const expectedProfitWei = expectedPayoutWei - budgetInWei;
  return { quantityWei, expectedPayoutWei, expectedProfitWei };
};

export function isWebsocketAutoTradeEnabled(
  configService: ConfigService,
): boolean {
  const raw = configService.get<string>('PREDICT_WS_AUTO_TRADE');
  if (!raw || raw.trim() === '') {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export function getChosenOutcomeIndexByTradeType(
  tradeType: BuyTradeType,
): 0 | 1 {
  switch (tradeType) {
    case 'yes':
    case 'greater-than-no':
      return 0;
    case 'no':
    case 'less-than-no':
      return 1;
  }
}

function getMarketDurationMs(market: {
  boostStartsAt?: string | null;
  boostEndsAt?: string | null;
}): number | null {
  const boostStart = market.boostStartsAt
    ? new Date(market.boostStartsAt)
    : null;
  const boostEnd = market.boostEndsAt ? new Date(market.boostEndsAt) : null;
  if (
    boostStart &&
    boostEnd &&
    !Number.isNaN(boostStart.getTime()) &&
    !Number.isNaN(boostEnd.getTime())
  ) {
    const boostDurationMs = boostEnd.getTime() - boostStart.getTime();
    if (boostDurationMs > 0) {
      return boostDurationMs;
    }
  }
  return null;
}

export function getMarketTimeLeftSeconds(market: {
  createdAt: string;
  boostStartsAt?: string | null;
  boostEndsAt?: string | null;
}): number | null {
  const createdAtDate = new Date(market.createdAt);
  if (Number.isNaN(createdAtDate.getTime())) {
    return null;
  }
  const durationMs = getMarketDurationMs(market);
  if (!durationMs) {
    return null;
  }
  const expiresAtMs = createdAtDate.getTime() + durationMs;
  const diffMs = Math.max(0, expiresAtMs - Date.now());
  return Math.floor(diffMs / 1000);
}

export function pruneDailyPnlCache(
  dailyRealizedPnlUsdByDate: Map<string, number>,
  todayKey: string,
): void {
  for (const key of dailyRealizedPnlUsdByDate.keys()) {
    if (key !== todayKey) {
      dailyRealizedPnlUsdByDate.delete(key);
    }
  }
}

export function recordDailyRealizedPnl(params: {
  dailyRealizedPnlUsdByDate: Map<string, number>;
  amountUsd: number;
  marketId?: number;
  timestamp?: Date;
}): {
  marketId?: number;
  amountUsd: number;
  totalUsd: number;
  timestamp: Date;
} | null {
  const { dailyRealizedPnlUsdByDate, amountUsd, marketId, timestamp } = params;
  if (!Number.isFinite(amountUsd) || amountUsd === 0) {
    return null;
  }
  const todayKey = getDateKey(new Date());
  const current = dailyRealizedPnlUsdByDate.get(todayKey) ?? 0;
  const next = current + amountUsd;
  dailyRealizedPnlUsdByDate.set(todayKey, next);
  return {
    marketId,
    amountUsd,
    totalUsd: next,
    timestamp: timestamp ?? new Date(),
  };
}

export async function getUnrealizedPnlUsdForToday(params: {
  positions: Position[];
  todayKey: string;
  getTradeByMarketId: (marketId: number) => Promise<TradeEntry | null>;
}): Promise<number> {
  const { positions, todayKey, getTradeByMarketId } = params;
  if (positions.length === 0) {
    return 0;
  }
  const entries = await Promise.all(
    positions.map(async (position) => {
      const trade = await getTradeByMarketId(position.market.id);
      if (!trade || trade.status === 'SOLD') {
        return 0;
      }
      const tradeDateKey = getDateKey(new Date(trade.buyTimestamp));
      if (tradeDateKey !== todayKey) {
        return 0;
      }
      const entryValueUsd = Number(trade.buyAmountInUsd);
      const currentValueUsd = Number(position.valueUsd);
      if (!Number.isFinite(entryValueUsd) || !Number.isFinite(currentValueUsd)) {
        return 0;
      }
      return currentValueUsd - entryValueUsd;
    }),
  );
  return entries.reduce((sum, value) => sum + value, 0);
}

export async function shouldHaltTradingForDay(params: {
  configService: ConfigService;
  dailyRealizedPnlUsdByDate: Map<string, number>;
  positions?: Position[];
  getUnrealizedPnlUsdForToday?: (
    params: {
      positions: Position[];
      todayKey: string;
      getTradeByMarketId: (marketId: number) => Promise<TradeEntry | null>;
    },
  ) => Promise<number>;
  getTradeByMarketId?: (marketId: number) => Promise<TradeEntry | null>;
}): Promise<{
  shouldHalt: boolean;
  reason?: 'profit' | 'loss';
  totalPnlUsd?: number;
  limitUsd?: number;
}> {
  const {
    configService,
    dailyRealizedPnlUsdByDate,
    positions,
    getUnrealizedPnlUsdForToday,
    getTradeByMarketId,
  } = params;
  const rawMaxProfit = configService.get<string>(
    'PREDICT_MAX_TRADING_PROFIT_IN_USD_FOR_THE_DAY',
  );
  const rawMaxLoss = configService.get<string>(
    'PREDICT_MAX_TRADING_LOSS_IN_USD_FOR_THE_DAY',
  );
  const maxProfit = Number(rawMaxProfit);
  const maxLoss = Number(rawMaxLoss);
  const profitLimit =
    Number.isFinite(maxProfit) && maxProfit > 0 ? maxProfit : null;
  const lossLimit =
    Number.isFinite(maxLoss) && maxLoss > 0 ? maxLoss : null;
  if (profitLimit === null && lossLimit === null) {
    return { shouldHalt: false };
  }

  const todayKey = getDateKey(new Date());
  pruneDailyPnlCache(dailyRealizedPnlUsdByDate, todayKey);
  let totalPnlUsd = dailyRealizedPnlUsdByDate.get(todayKey) ?? 0;
  if (
    positions &&
    positions.length > 0 &&
    getUnrealizedPnlUsdForToday &&
    getTradeByMarketId
  ) {
    const unrealizedPnlUsd = await getUnrealizedPnlUsdForToday({
      positions,
      todayKey,
      getTradeByMarketId,
    });
    totalPnlUsd += unrealizedPnlUsd;
  }

  if (profitLimit !== null && totalPnlUsd >= profitLimit) {
    return {
      shouldHalt: true,
      reason: 'profit',
      totalPnlUsd,
      limitUsd: profitLimit,
    };
  }
  if (lossLimit !== null && totalPnlUsd <= -lossLimit) {
    return {
      shouldHalt: true,
      reason: 'loss',
      totalPnlUsd,
      limitUsd: lossLimit,
    };
  }
  return { shouldHalt: false };
}

