export type NonEmptyArray<T> = [T, ...T[]];

export type Pretty<T> = {
  [K in keyof T]: T[K];
} extends infer U
  ? U
  : never;

export type AssetPriceUpdate = {
  price: number;
  publishTime: number;
  timestamp: number;
};

export type PredictOrderbook = {
  marketId?: number;
  updateTimestampMs?: number;
  orderCount?: number;
  asks?: unknown[];
  bids?: unknown[];
  priceFeedId?: number;
};

type BaseEvent = {
  orderId: string;
  timestamp: number;
  details: {
    marketQuestion: string;
    outcome: 'YES' | 'NO';
    quoteType: 'ASK' | 'BID';
    quantity: string;
    price: string;
    strategyType: 'MARKET' | 'LIMIT';
    categorySlug: string;
  };
};

type OrderAccepted = BaseEvent & { type: 'orderAccepted' };
type OrderNotAccepted = BaseEvent & {
  type: 'orderNotAccepted';
  reason: 'rejectedDuplicate' | 'noMarketMatch';
};
type OrderExpired = BaseEvent & { type: 'orderExpired' };
type OrderCancelled = BaseEvent & { type: 'orderCancelled' };
type OrderTransactionSubmitted = BaseEvent & {
  type: 'orderTransactionSubmitted';
  kind: 'SALE' | 'PURCHASE';
};
type OrderTransactionSuccess = BaseEvent & { type: 'orderTransactionSuccess' };
type OrderTransactionFailed = BaseEvent & { type: 'orderTransactionFailed' };

export type PredictWalletEvents =
  | OrderAccepted
  | OrderNotAccepted
  | OrderExpired
  | OrderCancelled
  | OrderTransactionSuccess
  | OrderTransactionSubmitted
  | OrderTransactionFailed;

export interface PredictOrderbookChannel {
  name: RealtimeTopic.PredictOrderbook;
  marketId: number;
}

export interface PredictWalletEventsChannel {
  name: RealtimeTopic.PredictWalletEvents;
  jwt: string;
}

export interface AssetPriceUpdateChannel {
  name: RealtimeTopic.AssetPriceUpdate;
  priceFeedId: number;
}

export type Channel = Pretty<
  | PredictOrderbookChannel
  | PredictWalletEventsChannel
  | AssetPriceUpdateChannel
>;

export enum RealtimeTopic {
  PredictOrderbook = 'predictOrderbook',
  AssetPriceUpdate = 'assetPriceUpdate',
  PredictWalletEvents = 'predictWalletEvents',
}

type WithRequestId<T> = T & { requestId: number };

export type SubscribeRequest = WithRequestId<{
  method: 'subscribe';
  params: NonEmptyArray<string>;
}>;
export type UnsubscribeRequest = WithRequestId<{
  method: 'unsubscribe';
  params: NonEmptyArray<string>;
}>;
export type HeartbeatRequest = { method: 'heartbeat'; data: unknown };

export type Requests = Pretty<
  HeartbeatRequest | SubscribeRequest | UnsubscribeRequest
>;

type InvalidJson = { code: 'invalid_json'; message?: string };
export type InvalidTopic = { code: 'invalid_topic'; message?: string };
export type InternalServerError = {
  code: 'internal_server_error';
  message?: string;
};
export type InvalidCredentials = { code: 'invalid_credentials'; message?: string };
export type UnsupportedContract = {
  code: 'unsupported_contract';
  message?: string;
};

export type ResponseError = Pretty<
  | InvalidJson
  | InvalidTopic
  | InternalServerError
  | InvalidCredentials
  | UnsupportedContract
>;

export type RequestResponse<T> = {
  type: 'R';
  requestId: number;
} & ({ success: true; data: T } | { success: false; error: ResponseError });

export type MessageResponse<Topic extends string, Data> = {
  type: 'M';
  topic: Topic;
  data: Data;
};

export type MessageResponses =
  | MessageResponse<'heartbeat', unknown>
  | MessageResponse<`predictOrderbook${string}`, unknown>
  | MessageResponse<`predictWalletEvents${string}`, PredictWalletEvents>
  | MessageResponse<`assetPriceUpdate${string}`, AssetPriceUpdate>;

export type Response = Pretty<MessageResponses | RequestResponse<undefined>>;

export type WSError =
  | ResponseError
  | { code: 'ws_disconnected'; message?: string }
  | { code: 'ws_error_terminated'; message?: string };

export type TopicName = string;

export type EventCallback = (
  arg: { err?: null; data: MessageResponses['data'] } | {
    err: WSError;
    data?: null;
  },
) => void;

