const CATEGORY_REFRESH_INTERVAL_MS = 300000; // 5 minutes

const AUTO_TRADE_INTERVAL_MS = 60000;

const SLIPPAGE_BPS = 200;

const REFERRAL_CODE = 99076;

const MIN_PROFIT_USD = 0.1;

type SupportedSlugKeyword = {
  kind: 'prefix' | 'suffix';
  value: string;
};

const SUPPORTED_SLUG_KEYWORDS: SupportedSlugKeyword[] = [
  { kind: 'suffix', value: '15-minutes' },
  { kind: 'suffix', value: 'daily' },
  { kind: 'prefix', value: 'lol' },
];

export {
  CATEGORY_REFRESH_INTERVAL_MS,
  AUTO_TRADE_INTERVAL_MS,
  SLIPPAGE_BPS,
  REFERRAL_CODE,
  MIN_PROFIT_USD,
  SUPPORTED_SLUG_KEYWORDS,
};