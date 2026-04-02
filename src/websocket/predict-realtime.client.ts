import WebSocket from 'ws';
import {
  Channel,
  EventCallback,
  MessageResponses,
  NonEmptyArray,
  Requests,
  Response,
  TopicName,
  RealtimeTopic,
} from 'src/types/websocket.types';

function neOf<T>(item: T): NonEmptyArray<T> {
  return [item] as NonEmptyArray<T>;
}

function isNonEmpty<T>(items: T[]): items is NonEmptyArray<T> {
  return items.length > 0;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toStringPayload = (data: WebSocket.RawData): string => {
  if (typeof data === 'string') {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString('utf-8');
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf-8');
  }
  return Buffer.from(data).toString('utf-8');
};

type LoggerLike = {
  warn(message: string): void;
  error(message: string, error?: unknown): void;
  log?(message: string): void;
};

export class RealtimeClient {
  constructor(
    private readonly url: string,
    private readonly options: {
      maxConnAttempts: number;
      maxRetryInterval: number;
    },
    private readonly logger?: LoggerLike,
  ) {
    this.ws = new WebSocket(this.url);
    this.bindAll();
  }

  private ws: WebSocket;
  private readonly topicSubReqIdMap: Map<number, TopicName> = new Map();
  private readonly subscriptions: Map<TopicName, NonEmptyArray<EventCallback>> =
    new Map();
  private connectionAttempts = 0;
  private requestId = 0;
  private manualClose = false;

  private bindAll(): void {
    this.ws.on('error', this.onError);
    this.ws.on('message', this.onMessage);
    this.ws.on('close', this.onClose);
    this.ws.on('open', this.onOpen);
  }

  private async reconnect() {
    const attempt = this.connectionAttempts++;
    if (attempt < this.options.maxConnAttempts) {
      const delay = Math.min(
        Math.pow(2, attempt) * 1000,
        this.options.maxRetryInterval,
      );
      await sleep(delay);

      this.ws = new WebSocket(this.url);
      this.bindAll();
    } else {
      const allHandlers = Array.from(this.subscriptions.values()).flat();

      for (const handler of allHandlers) {
        handler({
          err: {
            code: 'ws_disconnected',
            message: 'Max connection attempts reached',
          },
        });
      }
    }
  }

  private onOpen = () => {
    this.connectionAttempts = 0;
    this.logger?.log?.('Predict websocket open');

    for (const topic of this.subscriptions.keys()) {
      this.subUnsub('subscribe', topic);
    }
  };

  private onClose = () => {
    if (this.manualClose) {
      this.logger?.log?.('Predict websocket closed');
      return;
    }
    this.logger?.warn?.('Predict websocket closed unexpectedly, reconnecting.');
    void this.reconnect();
  };

  private onMessage = (data: WebSocket.RawData) => {
    try {
      const parsed = JSON.parse(toStringPayload(data)) as Response;

      if (parsed.type === 'M') {
        const topic = parsed.topic;

        if (topic === 'heartbeat') {
          this.logger?.log?.(`Predict websocket heartbeat ${parsed.data}`);
          this.send({ method: 'heartbeat', data: parsed.data });
        } else {
          const handlers = this.subscriptions.get(parsed.topic);

          for (const handler of handlers || []) {
            handler({ data: parsed.data });
          }
        }
      } else if (parsed.type === 'R') {
        const requestIdTopic = this.topicSubReqIdMap.get(parsed.requestId);

        if (requestIdTopic) {
          if (parsed.success) {
            this.topicSubReqIdMap.delete(parsed.requestId);
          } else {
            const handlers = this.subscriptions.get(requestIdTopic);

            if (handlers) {
              for (const handler of handlers) {
                handler({ err: parsed.error });
              }
            }

            this.subscriptions.delete(requestIdTopic);
          }

          this.topicSubReqIdMap.delete(parsed.requestId);
        } else {
          this.logger?.warn?.(
            `Unknown response received ${JSON.stringify(parsed, null, 2)}`,
          );
        }
      }
    } catch (error) {
      this.logger?.warn?.(
        `Failed to parse websocket message: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  };

  private onError = (error: Error) => {
    const allHandlers = Array.from(this.subscriptions.values()).flat();

    for (const handler of allHandlers) {
      handler({
        err: { code: 'ws_error_terminated', message: 'Websocket error' },
      });
    }

    this.logger?.error?.('RealtimeClientSocketError', error);
  };

  private send(data: Requests) {
    if (this.ws.readyState === WebSocket.OPEN) {
      if (data.method === 'subscribe') {
        this.topicSubReqIdMap.set(data.requestId, data.params[0]);
      }
      if (data.method === 'heartbeat') {
        this.logger?.log?.('Predict websocket heartbeat response sent');
      }

      return this.ws.send(JSON.stringify(data));
    }
    this.logger?.warn?.('Not connected to WS. Ignoring.');
  }

  private subUnsub(method: 'subscribe' | 'unsubscribe', topic: string) {
    const data = {
      requestId: this.requestId++,
      method,
      params: neOf(topic),
    };

    this.send(data);
  }

  private getTopicStringFor(topic: Channel): string {
    switch (topic.name) {
      case RealtimeTopic.PredictOrderbook:
        return ['predictOrderbook', topic.marketId].join(
          '/',
        ) as `predictOrderbook${string}`;
      case RealtimeTopic.AssetPriceUpdate:
        return ['assetPriceUpdate', topic.priceFeedId].join(
          '/',
        ) as `assetPriceUpdate${string}`;
      case RealtimeTopic.PredictWalletEvents:
        return ['predictWalletEvents', topic.jwt].join(
          '/',
        ) as `predictWalletEvents${string}`;
    }
  }

  subscribe(
    topic: Channel,
    callback: EventCallback,
  ): { unsubscribe: () => void } {
    const topicName = this.getTopicStringFor(topic);
    const existing = this.subscriptions.get(topicName);

    if (existing) {
      existing.push(callback);
    } else {
      this.subscriptions.set(topicName, [callback]);
      if (this.isOpen()) {
        this.subUnsub('subscribe', topicName);
      }
    }

    return {
      unsubscribe: (): void => {
        const item = this.subscriptions.get(topicName);

        if (!item) {
          throw new Error('InconsistentState: No subscriptions for this topic');
        }

        const cbRemoved = item.filter((x) => x !== callback);

        if (isNonEmpty(cbRemoved)) {
          this.subscriptions.set(topicName, cbRemoved);
        } else {
          this.subscriptions.delete(topicName);
          this.subUnsub('unsubscribe', topicName);
        }
      },
    };
  }

  refreshSubscriptions(): void {
    if (!this.isOpen()) {
      return;
    }
    for (const topic of this.subscriptions.keys()) {
      this.subUnsub('subscribe', topic);
    }
  }

  close(): void {
    this.manualClose = true;
    this.ws.close();
  }

  isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  getActiveTopics(): TopicName[] {
    return Array.from(this.subscriptions.keys());
  }

  getSubscriptionCount(): number {
    return Array.from(this.subscriptions.values()).reduce(
      (total, handlers) => total + handlers.length,
      0,
    );
  }
}

export type { MessageResponses };
