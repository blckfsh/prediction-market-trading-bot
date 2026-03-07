const BUY_TRADE_TYPES = [
  'yes',
  'no',
  'avg-price',
  'na',
] as const;

type BuyTradeType = (typeof BUY_TRADE_TYPES)[number];

const DEFAULT_BUY_TRADE_TYPE: BuyTradeType = 'avg-price';

function normalizeBuyTradeType(
  value?: string | null,
  options?: { defaultType?: BuyTradeType },
): BuyTradeType {
  const defaultType = options?.defaultType ?? DEFAULT_BUY_TRADE_TYPE;
  if (!value) {
    return defaultType;
  }
  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue === 'greater-than-no') {
    return 'yes';
  }
  if (normalizedValue === 'less-than-no') {
    return 'no';
  }
  return BUY_TRADE_TYPES.includes(normalizedValue as BuyTradeType)
    ? (normalizedValue as BuyTradeType)
    : defaultType;
}

function getChosenOutcomeIndexByTradeType(params: {
  tradeType: BuyTradeType;
  yesBuyPrice: number;
  noBuyPrice: number;
}): 0 | 1 | null {
  const { tradeType, yesBuyPrice, noBuyPrice } = params;
  switch (tradeType) {
    case 'yes':
      return 0;
    case 'no':
      return 1;
    case 'avg-price':
      return yesBuyPrice > noBuyPrice ? 0 : 1;
    case 'na':
      return null;
  }
}

export {
  BUY_TRADE_TYPES,
  DEFAULT_BUY_TRADE_TYPE,
  normalizeBuyTradeType,
  getChosenOutcomeIndexByTradeType,
};

export type { BuyTradeType };
