import { ConfigService } from '@nestjs/config';
import { PredictRepository } from '../predict.repository';
import { TradeService } from './trade.service';

jest.mock(
  '@prisma/client',
  () => ({
    PrismaClient: class {},
  }),
  { virtual: true },
);

jest.mock('../predict.repository', () => ({
  PredictRepository: class PredictRepository {},
}));

jest.mock(
  'generated/prisma/client',
  () => ({
    TradeStatus: { BOUGHT: 'BOUGHT', SOLD: 'SOLD' },
    Trade: class {},
  }),
  { virtual: true },
);

describe('TradeService', () => {
  let service: TradeService;
  let configService: ConfigService;
  let predictRepository: PredictRepository;

  beforeEach(() => {
    configService = {
      get: jest.fn(),
    } as unknown as ConfigService;

    predictRepository = {
      getTradeByMarketId: jest.fn(),
      saveMarketTrade: jest.fn(),
      updateMarketTradeStatus: jest.fn(),
    } as unknown as PredictRepository;

    service = new TradeService(predictRepository, configService);

    global.Headers = jest.fn(() => ({
      append: jest.fn(),
    })) as any;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('evaluateStopLoss should return when stop loss is not configured', async () => {
    const getStopLossPercentageForMarketSlug = jest.fn().mockReturnValue(null);

    await service.evaluateStopLoss({
      positions: [
        {
          market: { id: 1, status: 'OPEN' },
          outcome: { onChainId: '1' },
          amount: '1000000000000000000',
          valueUsd: '40',
        },
      ] as any,
      getOrderBookByMarketId: jest.fn(),
      getMarketById: jest.fn(),
      subscribeToOrderbook: jest.fn(),
      getStopLossPercentageForMarketSlug,
      getAmountPercentageForMarketSlug: jest.fn().mockReturnValue(null),
      createOrder: jest.fn(),
      orderBuilder: {} as any,
      signer: { address: '0xSigner' } as any,
    });

    expect(predictRepository.getTradeByMarketId).not.toHaveBeenCalled();
  });

  it('evaluateProfitTaking should return when disabled', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) =>
      key === 'PREDICT_PROFIT_TAKING_ENABLED' ? 'false' : undefined,
    );

    await service.evaluateProfitTaking({
      positions: [
        {
          market: { id: 1, status: 'OPEN' },
          outcome: { onChainId: '1' },
          amount: '1000000000000000000',
          valueUsd: '140',
        },
      ] as any,
      getOrderBookByMarketId: jest.fn(),
      getMarketById: jest.fn(),
      subscribeToOrderbook: jest.fn(),
      getAmountPercentageForMarketSlug: jest.fn().mockReturnValue(100),
      createOrder: jest.fn(),
      orderBuilder: {} as any,
      signer: { address: '0xSigner' } as any,
    });

    expect(predictRepository.getTradeByMarketId).not.toHaveBeenCalled();
  });

  it('evaluateProfitTaking should sell when profit threshold reached', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'PREDICT_PROFIT_TAKING_ENABLED') {
        return 'true';
      }
      if (key === 'PREDICT_PROFIT_TAKING_PERCENTAGE') {
        return '20';
      }
      return undefined;
    });

    const repo = predictRepository as any;
    repo.getTradeByMarketId = jest.fn().mockResolvedValue({
      id: 1,
      status: 'BOUGHT',
      amount: 100,
    });

    const sellPositionSpy = jest
      .spyOn(service as any, 'sellPosition')
      .mockResolvedValue(undefined);

    await service.evaluateProfitTaking({
      positions: [
        {
          market: { id: 1, status: 'OPEN', categorySlug: 'cat' },
          outcome: { onChainId: '1' },
          amount: '1000000000000000000',
          valueUsd: '130',
        },
      ] as any,
      getOrderBookByMarketId: jest.fn(),
      getMarketById: jest.fn(),
      subscribeToOrderbook: jest.fn(),
      getAmountPercentageForMarketSlug: jest.fn().mockReturnValue(50),
      createOrder: jest.fn(),
      orderBuilder: {} as any,
      signer: { address: '0xSigner' } as any,
    });

    expect(sellPositionSpy).toHaveBeenCalledTimes(1);
  });

  it('createOrder should post and return response', async () => {
    const mockResponse = {
      success: true,
      data: { orderId: '1', orderHash: '', code: '' },
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as any);

    const result = await service.createOrder({
      baseUrl: 'https://api.example.com',
      apiKey: 'test-api-key',
      token: 'jwt-token',
      createOrderBody: { data: {} } as any,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/orders',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual(mockResponse);
  });

  it('createTradeFromOrderbook should skip when auto trade disabled', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) =>
      key === 'PREDICT_WS_AUTO_TRADE' ? 'false' : undefined,
    );

    const buySpy = jest
      .spyOn(service as any, 'buyPosition')
      .mockResolvedValue(undefined);

    await service.createTradeFromOrderbook({
      marketId: 1,
      marketTradeInFlight: new Set(),
      marketTradeLastAttemptAt: new Map(),
      getMarketSlugById: jest.fn(),
      getTradeAmountForMarketSlug: jest.fn(),
      getEntrySecondsForMarketSlug: jest.fn().mockReturnValue(0),
      orderBuilder: {} as any,
      signer: { address: '0xSigner' } as any,
      getOrderBookByMarketId: jest.fn(),
      getMarketById: jest.fn(),
      subscribeToOrderbook: jest.fn(),
      requestContext: {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-api-key',
        token: 'jwt-token',
      },
    });

    expect(buySpy).not.toHaveBeenCalled();
  });
});

