export enum MarketStatus {
  REGISTERED = 'REGISTERED',
  PRICE_PROPOSED = 'PRICE_PROPOSED',
  PRICE_DISPUTED = 'PRICE_DISPUTED',
  PAUSED = 'PAUSED',
  UNPAUSED = 'UNPAUSED',
  RESOLVED = 'RESOLVED',
}

export enum OutcomeStatus {
  WON = 'WON',
  LOST = 'LOST',
}

export interface Resolution {
  name: string;
  indexSet: number;
  onChainId: string;
  status: OutcomeStatus;
}

export interface Outcome {
  name: string;
  indexSet: number;
  onChainId: string;
  status: OutcomeStatus;
}

export interface Market {
  id: number;
  imageUrl: string;
  title: string;
  question: string;
  description: string;
  status: MarketStatus;
  isNegRisk: boolean;
  isYieldBearing: boolean;
  feeRateBps: number;
  resolution: Resolution;
  oracleQuestionId: string;
  conditionId: string;
  resolverAddress: string;
  outcomes: Outcome[];
  questionIndex: number;
  spreadThreshold: number;
  shareThreshold: number;
  polymarketConditionIds: string[];
  kalshiMarketTicker: string;
  categorySlug: string;
  createdAt: string;
  decimalPrecision: number;
}

export interface GetAllMarketsResponse {
  success: boolean;
  cursor: string;
  data: Market[];
}

export interface Position {
  id: string;
  market: Market;
  outcome: Outcome;
  amount: string;
  valueUsd: string;
}

export interface GetAllPositionsResponse {
  success: boolean;
  cursor: string;
  data: Position[];
}

export enum MarketVariant {
  DEFAULT = 'DEFAULT',
  SPORTS_MATCH = 'SPORTS_MATCH',
  CRYPTO_UP_DOWN = 'CRYPTO_UP_DOWN'
}

export enum CategoryStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED'
}

export interface Tag {
  id: string;
  name: string;
}

export interface Category {
  id: number;
  slug: string;
  title: string;
  description: string;
  imageUrl: string;
  isNegRisk: boolean;
  isYieldBearing: boolean;
  marketVariant: MarketVariant;
  createdAt: string;
  markets: Market[];
  startsAt: string;
  status: CategoryStatus;
  tags: Tag[];
}

export interface GetCategoriesByResponse {
  success: boolean;
  cursor: string;
  data: Category[];
}

export interface MarketStatistics {
  totalLiquidityUsd: number;
  volumeTotalUsd: number;
  volume24hUsd: number;
}

export interface GetMarketStatisticsResponse {
  success: boolean;
  data: MarketStatistics
}

