import { ConfigService } from '@nestjs/config';
import { PredictRepository } from 'src/predict/predict.repository';
import { TradeService } from './trade.service';
import { getDateKey } from './trade.service.helper';

jest.mock(
  '@prisma/client',
  () => ({
    PrismaClient: class {},
    TradeStatus: { BOUGHT: 'BOUGHT', SOLD: 'SOLD' },
    Trade: class {},
  }),
  { virtual: true },
);

jest.mock('src/predict/predict.repository', () => ({
  PredictRepository: class PredictRepository {},
}));

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
      getActiveTradeByMarketId: jest.fn(),
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
      slug: 'cat::outcome:1',
      buyAmount: 100,
      buyAmountInUsd: 100,
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
      getBuyTradeTypeForMarketSlug: jest.fn().mockReturnValue('avg-price'),
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

  it('createTradeFromOrderbook should skip when daily profit limit reached', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'PREDICT_WS_AUTO_TRADE') {
        return 'true';
      }
      if (key === 'PREDICT_MAX_TRADING_PROFIT_IN_USD_FOR_THE_DAY') {
        return '100';
      }
      return undefined;
    });

    const todayKey = getDateKey(new Date());
    (service as any).dailyRealizedPnlUsdByDate.set(todayKey, 120);

    const buySpy = jest
      .spyOn(service as any, 'buyPosition')
      .mockResolvedValue(undefined);

    await service.createTradeFromOrderbook({
      marketId: 1,
      marketTradeInFlight: new Set(),
      marketTradeLastAttemptAt: new Map(),
      positions: [],
      getMarketSlugById: jest.fn().mockReturnValue('slug'),
      getTradeAmountForMarketSlug: jest.fn().mockReturnValue(1),
      getEntrySecondsForMarketSlug: jest.fn().mockReturnValue(0),
      getBuyTradeTypeForMarketSlug: jest.fn().mockReturnValue('avg-price'),
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

  it('buyPosition should skip when one of the outcome prices is zero', async () => {
    const market = {
      marketId: 1,
      slug: 'cat',
      buyAmount: 1,
      buyAmountInUsd: 1,
      buyTimestamp: new Date(),
      status: 'BOUGHT',
    };

    const repo = predictRepository as any;
    repo.getActiveTradeByMarketId = jest.fn().mockResolvedValue(null);

    const getOrderBookByMarketId = jest.fn().mockResolvedValue({
      success: true,
      data: {
        marketId: 1,
        updateTimestampMs: Date.now(),
        asks: [[0, 1]],
        bids: [[0.99, 1]],
      },
    });

    const getMarketById = jest.fn().mockResolvedValue({
      success: true,
      data: {
        id: 1,
        feeRateBps: 100,
        isNegRisk: false,
        isYieldBearing: false,
        decimalPrecision: 2,
        outcomes: [{ onChainId: '1' }, { onChainId: '2' }],
        createdAt: new Date().toISOString(),
      },
    });

    const subscribeToOrderbook = jest.fn();
    const createOrderSpy = jest
      .fn()
      .mockResolvedValue({ success: true } as any);

    await (service as any).buyPosition({
      market,
      orderBuilder: {} as any,
      signer: { address: '0xSigner' } as any,
      entrySeconds: null,
      getOrderBookByMarketId,
      getMarketById,
      subscribeToOrderbook,
      createOrder: createOrderSpy,
    });

    expect(createOrderSpy).not.toHaveBeenCalled();
  });

  it('buyPosition should choose outcome by sports keyword when provided', async () => {
    const market = {
      marketId: 1,
      slug: 'lol-g2-vs-t1-2026-03-07',
      buyAmount: 1,
      buyAmountInUsd: 1,
      buyTimestamp: new Date(),
      status: 'BOUGHT',
    };

    const repo = predictRepository as any;
    repo.getActiveTradeByMarketId = jest.fn().mockResolvedValue(null);
    repo.saveMarketTrade = jest.fn().mockResolvedValue({ id: 99 });

    const getOrderBookByMarketId = jest.fn().mockResolvedValue({
      success: true,
      data: {
        marketId: 1,
        updateTimestampMs: Date.now(),
        asks: [[0.4, 10]],
        bids: [[0.4, 10]],
      },
    });

    const getMarketById = jest.fn().mockResolvedValue({
      success: true,
      data: {
        id: 1,
        feeRateBps: 100,
        isNegRisk: false,
        isYieldBearing: false,
        decimalPrecision: 2,
        outcomes: [
          { name: 'T1', onChainId: '1' },
          { name: 'G2', onChainId: '2' },
        ],
        createdAt: new Date().toISOString(),
      },
    });

    const buildOrderMock = jest.fn().mockReturnValue({
      maker: '0xSigner',
      signer: '0xSigner',
      taker: '0x0000000000000000000000000000000000000000',
      tokenId: 2n,
      makerAmount: 1000000000000000000n,
      takerAmount: 1000000000000000000n,
      expiration: 1n,
      nonce: 1n,
      feeRateBps: 100n,
      side: 0,
      signatureType: 0,
      salt: 1n,
    });
    const orderBuilder = {
      getLimitOrderAmounts: jest.fn().mockReturnValue({
        pricePerShare: 0.6,
        makerAmount: 1000000000000000000n,
        takerAmount: 1000000000000000000n,
      }),
      buildOrder: buildOrderMock,
      buildTypedData: jest.fn().mockReturnValue({}),
      signTypedDataOrder: jest.fn().mockResolvedValue({
        maker: '0xSigner',
        signer: '0xSigner',
        taker: '0x0000000000000000000000000000000000000000',
        tokenId: 2n,
        makerAmount: 1000000000000000000n,
        takerAmount: 1000000000000000000n,
        expiration: 1n,
        nonce: 1n,
        feeRateBps: 100n,
        side: 0,
        signatureType: 0,
        signature: '0xsig',
        salt: 1n,
      }),
      buildTypedDataHash: jest.fn().mockResolvedValue('0xhash'),
    };

    const createOrderSpy = jest.fn().mockResolvedValue({
      success: true,
      data: { orderHash: '0xorderhash' },
    });

    await (service as any).buyPosition({
      market,
      orderBuilder,
      signer: { address: '0xSigner' } as any,
      entrySeconds: null,
      buyTradeType: 'yes',
      sportsBetKeyword: 'g2',
      getOrderBookByMarketId,
      getMarketById,
      subscribeToOrderbook: jest.fn(),
      createOrder: createOrderSpy,
    });

    expect(buildOrderMock).toHaveBeenCalledWith(
      'LIMIT',
      expect.objectContaining({
        tokenId: '2',
      }),
    );
    expect(createOrderSpy).toHaveBeenCalled();
  });

  it('buyPosition should skip when sports keyword does not match outcomes', async () => {
    const market = {
      marketId: 1,
      slug: 'lol-g2-vs-t1-2026-03-07',
      buyAmount: 1,
      buyAmountInUsd: 1,
      buyTimestamp: new Date(),
      status: 'BOUGHT',
    };

    const repo = predictRepository as any;
    repo.getActiveTradeByMarketId = jest.fn().mockResolvedValue(null);
    repo.saveMarketTrade = jest.fn();

    const getOrderBookByMarketId = jest.fn().mockResolvedValue({
      success: true,
      data: {
        marketId: 1,
        updateTimestampMs: Date.now(),
        asks: [[0.4, 10]],
        bids: [[0.4, 10]],
      },
    });

    const getMarketById = jest.fn().mockResolvedValue({
      success: true,
      data: {
        id: 1,
        feeRateBps: 100,
        isNegRisk: false,
        isYieldBearing: false,
        decimalPrecision: 2,
        outcomes: [
          { name: 'T1', onChainId: '1' },
          { name: 'FNC', onChainId: '2' },
        ],
        createdAt: new Date().toISOString(),
      },
    });

    const buildOrderMock = jest.fn();
    const orderBuilder = {
      getLimitOrderAmounts: jest.fn(),
      buildOrder: buildOrderMock,
      buildTypedData: jest.fn(),
      signTypedDataOrder: jest.fn(),
      buildTypedDataHash: jest.fn(),
    };

    const createOrderSpy = jest.fn();

    await (service as any).buyPosition({
      market,
      orderBuilder,
      signer: { address: '0xSigner' } as any,
      entrySeconds: null,
      buyTradeType: 'yes',
      sportsBetKeyword: 'g2',
      getOrderBookByMarketId,
      getMarketById,
      subscribeToOrderbook: jest.fn(),
      createOrder: createOrderSpy,
    });

    expect(buildOrderMock).not.toHaveBeenCalled();
    expect(createOrderSpy).not.toHaveBeenCalled();
  });
});
