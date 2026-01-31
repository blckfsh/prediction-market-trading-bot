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

  it('evaluateStopLoss should return when limit loss is not configured', async () => {
    (configService.get as jest.Mock).mockReturnValue(undefined);

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
      createOrder: jest.fn(),
      orderBuilder: {} as any,
      signer: { address: '0xSigner' } as any,
    });

    expect(predictRepository.getTradeByMarketId).not.toHaveBeenCalled();
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

