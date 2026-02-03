import { parseEther, WeiPerEther } from 'ethers';

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

