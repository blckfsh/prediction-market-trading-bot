const BUY_TRADE_TYPES = [
  'yes',
  'no',
  'greater-than-no',
  'less-than-no',
] as const;

type BuyTradeType = (typeof BUY_TRADE_TYPES)[number];

const DEFAULT_BUY_TRADE_TYPE: BuyTradeType = 'greater-than-no';

function normalizeBuyTradeType(value?: string | null): BuyTradeType {
  if (!value) {
    return DEFAULT_BUY_TRADE_TYPE;
  }
  return BUY_TRADE_TYPES.includes(value as BuyTradeType)
    ? (value as BuyTradeType)
    : DEFAULT_BUY_TRADE_TYPE;
}

function getChosenOutcomeIndexByTradeType(tradeType: BuyTradeType): 0 | 1 {
  switch (tradeType) {
    case 'yes':
    case 'greater-than-no':
      return 0;
    case 'no':
    case 'less-than-no':
      return 1;
  }
}

export {
  BUY_TRADE_TYPES,
  DEFAULT_BUY_TRADE_TYPE,
  normalizeBuyTradeType,
  getChosenOutcomeIndexByTradeType,
};

export type { BuyTradeType };
