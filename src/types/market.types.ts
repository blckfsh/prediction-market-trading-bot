import { TradeStatus } from 'generated/prisma/client';

enum MarketStatus {
  REGISTERED = 'REGISTERED',
  PRICE_PROPOSED = 'PRICE_PROPOSED',
  PRICE_DISPUTED = 'PRICE_DISPUTED',
  PAUSED = 'PAUSED',
  UNPAUSED = 'UNPAUSED',
  RESOLVED = 'RESOLVED',
}

enum OutcomeStatus {
  WON = 'WON',
  LOST = 'LOST',
}

interface Resolution {
  name: string;
  indexSet: number;
  onChainId: string;
  status: OutcomeStatus | null;
}

interface Outcome {
  name: string;
  indexSet: number;
  onChainId: string;
  status: OutcomeStatus | null;
}

interface Market {
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
  boostStartsAt?: string | null;
  boostEndsAt?: string | null;
  createdAt: string;
  decimalPrecision: number;
}

interface GetAllMarketsResponse {
  success: boolean;
  cursor: string;
  data: Market[];
}

interface MarketDataResponse {
  success: boolean;
  data: Market;
}

interface Position {
  id: string;
  market: Market;
  outcome: Outcome;
  amount: string;
  valueUsd: string;
}

interface RedeemPositionParams {
  conditionId: string;
  indexSet: 1 | 2;
  isNegRisk: boolean;
  isYieldBearing: boolean;
  amount?: bigint;
}

interface GetAllPositionsResponse {
  success: boolean;
  cursor: string;
  data: Position[];
}

enum MarketVariant {
  DEFAULT = 'DEFAULT',
  SPORTS_MATCH = 'SPORTS_MATCH',
  CRYPTO_UP_DOWN = 'CRYPTO_UP_DOWN',
}

enum CategoryStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
}

enum OrderStrategy {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
}

interface Tag {
  id: string;
  name: string;
}

interface Category {
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

interface GetCategoriesByResponse {
  success: boolean;
  cursor: string;
  data: Category[];
}

interface MarketStatistics {
  totalLiquidityUsd: number;
  volumeTotalUsd: number;
  volume24hUsd: number;
}

interface GetMarketStatisticsResponse {
  success: boolean;
  data: MarketStatistics;
}

interface OrderBookData {
  marketId: number;
  updateTimestampMs: number;
  asks: number[][];
  bids: number[][];
}

interface GetOrderBookResponse {
  success: boolean;
  data: OrderBookData;
}

interface CreateOrderData {
  code: string;
  orderId: string;
  orderHash: string;
}

interface CreateOrderError {
  _tag: string;
  message: string;
}

enum TradeStrategy {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
}

interface CreateOrderBody {
  data: {
    pricePerShare: string;
    strategy: TradeStrategy;
    slippageBps: string;
    isFillOrKill: boolean;
    order: {
      hash: string;
      salt: string;
      maker: string;
      signer: string;
      taker: string;
      tokenId: string;
      makerAmount: string;
      takerAmount: string;
      expiration: string;
      nonce: string;
      feeRateBps: string;
      side: number;
      signatureType: number;
      signature: string;
    };
  };
}

interface CreateOrderResponse {
  success: boolean;
  data?: CreateOrderData;
  error?: CreateOrderError;
}

interface SaveMarketTradeInput {
  marketId: number;
  slug: string;
  buyAmount: number;
  buyAmountInUsd: number;
  buyOrderHash?: string;
  buyTimestamp: Date;
  status: TradeStatus;
}

export {
  MarketStatus,
  OutcomeStatus,
  MarketVariant,
  CategoryStatus,
  OrderStrategy,
  TradeStrategy,
};

export type {
  Resolution,
  Outcome,
  Market,
  GetAllMarketsResponse,
  MarketDataResponse,
  Position,
  RedeemPositionParams,
  GetAllPositionsResponse,
  Tag,
  Category,
  GetCategoriesByResponse,
  MarketStatistics,
  GetMarketStatisticsResponse,
  OrderBookData,
  GetOrderBookResponse,
  CreateOrderData,
  CreateOrderError,
  CreateOrderBody,
  CreateOrderResponse,
  SaveMarketTradeInput,
};
