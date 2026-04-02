import { ConfigService } from '@nestjs/config';
import { PredictRealtimeService } from './predict-realtime.service';
import { RealtimeClient } from './predict-realtime.client';

let mockClient: {
  subscribe: jest.Mock;
  close: jest.Mock;
  refreshSubscriptions: jest.Mock;
};

jest.mock('./predict-realtime.client', () => ({
  RealtimeClient: jest.fn(() => mockClient),
}));

const createConfigService = (overrides: Record<string, string | undefined>) =>
  ({
    get: jest.fn((key: string) => overrides[key]),
  }) as unknown as ConfigService;

describe('PredictRealtimeService', () => {
  beforeEach(() => {
    mockClient = {
      subscribe: jest.fn(),
      close: jest.fn(),
      refreshSubscriptions: jest.fn(),
    };
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('connects once and reuses the client', () => {
    const configService = createConfigService({
      PREDICT_WS_URL: 'wss://example.test/ws',
      PREDICT_WS_MAX_ATTEMPTS: '5',
      PREDICT_WS_MAX_RETRY_INTERVAL_MS: '30000',
      PREDICT_WS_REFRESH_INTERVAL_MS: '0',
    });
    const service = new PredictRealtimeService(configService);

    const first = service.connect();
    const second = service.connect();

    expect(first).toBe(second);
    expect(RealtimeClient).toHaveBeenCalledTimes(1);
  });

  it('builds websocket url with apiKey when provided', () => {
    const configService = createConfigService({
      PREDICT_WS_URL: 'wss://example.test/ws',
      PREDICT_API_KEY: 'secret-key',
      PREDICT_WS_MAX_ATTEMPTS: '5',
      PREDICT_WS_MAX_RETRY_INTERVAL_MS: '30000',
      PREDICT_WS_REFRESH_INTERVAL_MS: '0',
    });
    const service = new PredictRealtimeService(configService);

    service.connect();

    const [[url]] = (RealtimeClient as jest.Mock).mock.calls;
    expect(url).toBe('wss://example.test/ws?apiKey=secret-key');
  });

  it('throws if websocket url is not configured', () => {
    const configService = createConfigService({
      PREDICT_WS_URL: undefined,
    });
    const service = new PredictRealtimeService(configService);

    expect(() => service.connect()).toThrow('PREDICT_WS_URL is not configured');
  });

  it('delegates subscribe to the realtime client', () => {
    const configService = createConfigService({
      PREDICT_WS_URL: 'wss://example.test/ws',
      PREDICT_WS_MAX_ATTEMPTS: '5',
      PREDICT_WS_MAX_RETRY_INTERVAL_MS: '30000',
      PREDICT_WS_REFRESH_INTERVAL_MS: '0',
    });
    const service = new PredictRealtimeService(configService);
    const topic = { name: 'predictOrderbook', marketId: 123 };
    const callback = jest.fn();
    mockClient.subscribe.mockReturnValue({ unsubscribe: jest.fn() });

    service.subscribe(topic as any, callback);

    expect(mockClient.subscribe).toHaveBeenCalledWith(topic, callback);
  });

  it('closes the client and clears it', () => {
    const configService = createConfigService({
      PREDICT_WS_URL: 'wss://example.test/ws',
      PREDICT_WS_MAX_ATTEMPTS: '5',
      PREDICT_WS_MAX_RETRY_INTERVAL_MS: '30000',
      PREDICT_WS_REFRESH_INTERVAL_MS: '0',
    });
    const service = new PredictRealtimeService(configService);
    service.connect();

    service.close();

    expect(mockClient.close).toHaveBeenCalledTimes(1);
  });

  it('refreshes subscriptions on interval', () => {
    jest.useFakeTimers();
    const configService = createConfigService({
      PREDICT_WS_URL: 'wss://example.test/ws',
      PREDICT_WS_MAX_ATTEMPTS: '5',
      PREDICT_WS_MAX_RETRY_INTERVAL_MS: '30000',
      PREDICT_WS_REFRESH_INTERVAL_MS: '10',
    });
    const service = new PredictRealtimeService(configService);
    service.connect();

    jest.advanceTimersByTime(10);

    expect(mockClient.refreshSubscriptions).toHaveBeenCalled();
  });
});
