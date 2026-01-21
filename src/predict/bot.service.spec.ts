import { BotService } from './bot.service';
import { ConfigService } from '@nestjs/config';
import { PredictRepository } from './predict.repository';
import {
  GetAllMarketsResponse,
  GetCategoriesByResponse,
  GetAllPositionsResponse,
  GetOrderBookResponse,
  MarketDataResponse,
  MarketStatistics,
  CreateOrderBody,
  CreateOrderResponse,
} from './types/market.types';
import { TradeStatus } from 'generated/prisma/client';

jest.mock(
  'generated/prisma/client',
  () => ({
    TradeStatus: { BOUGHT: 'BOUGHT', SOLD: 'SOLD' },
    Trade: class {},
  }),
  { virtual: true },
);

jest.mock(
  '@prisma/client',
  () => ({
    PrismaClient: class {},
  }),
  { virtual: true },
);

jest.mock('./predict.repository', () => {
  const MockRepo = jest.fn().mockImplementation(() => ({
    saveMarketTrade: jest.fn(),
    getTradeByMarketId: jest.fn(),
  }));
  return { PredictRepository: MockRepo };
});

describe('BotService', () => {
  let service: BotService;
  let configService: ConfigService;
  let predictRepository: PredictRepository;

  beforeEach(() => {
    // Minimal mocks for dependencies
    configService = {
      get: jest.fn(),
    } as unknown as ConfigService;

    predictRepository = new PredictRepository(
      {} as any,
    ) as unknown as PredictRepository;

    // attach mocks for wallet approvals explicitly to avoid undefined in tests
    (predictRepository as any).getWalletApprovalByWalletAddress = jest.fn();
    (predictRepository as any).saveWalletApprovals = jest.fn();

    service = new BotService(configService, predictRepository);

    // Inject required config values directly
    (service as any).baseUrl = 'https://api.example.com';
    (service as any).apiKey = 'test-api-key';
    (service as any).predictAccount = '0xPredict';

    // Mock Headers used in fetch calls
    global.Headers = jest.fn(() => ({
      append: jest.fn(),
    })) as any;

    // Default token for authenticated endpoints
    (service as any).token = 'jwt-token';
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('getAllMarkets should fetch and return markets data', async () => {
    const mockResponse: GetAllMarketsResponse = {
      success: true,
      cursor: '',
      data: [
        {
          id: 1,
          imageUrl: '',
          title: 'Market 1',
          question: 'Q1',
          description: '',
          status: 'OPEN' as any,
          isNegRisk: false,
          isYieldBearing: false,
          feeRateBps: 0,
          resolution: {
            name: '',
            indexSet: 0,
            onChainId: '',
            status: 'WON' as any,
          },
          oracleQuestionId: '',
          conditionId: '',
          resolverAddress: '',
          outcomes: [],
          questionIndex: 0,
          spreadThreshold: 0,
          shareThreshold: 0,
          polymarketConditionIds: [],
          kalshiMarketTicker: '',
          categorySlug: '',
          createdAt: '',
          decimalPrecision: 18,
        },
      ],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as any);

    const result = await service.getAllMarkets();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/markets',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(result).toEqual(mockResponse);
  });

  it('getDefaultMarkets should fetch and return categories', async () => {
    const mockResponse: GetCategoriesByResponse = {
      success: true,
      cursor: '',
      data: [
        {
          id: 1,
          slug: 'cat',
          title: 'Category',
          description: '',
          imageUrl: '',
          isNegRisk: false,
          isYieldBearing: false,
          marketVariant: 'DEFAULT' as any,
          createdAt: '',
          markets: [],
          startsAt: '2024-01-01T00:00:00Z',
          status: 'OPEN' as any,
          tags: [],
        },
      ],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as any);

    const result = await service.getDefaultMarkets();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/categories?status=OPEN',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(result).toEqual(mockResponse);
  });

  it('getAllPositions should fetch and return positions', async () => {
    const mockResponse: GetAllPositionsResponse = {
      success: true,
      cursor: '',
      data: [],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as any);

    const result = await service.getAllPositions();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/positions',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(result).toEqual(mockResponse);
  });

  it('getMarketById should fetch and return market data', async () => {
    const mockResponse: MarketDataResponse = {
      success: true,
      data: {
        id: 1,
        imageUrl: '',
        title: '',
        question: '',
        description: '',
        status: 'OPEN' as any,
        isNegRisk: false,
        isYieldBearing: false,
        feeRateBps: 0,
        resolution: {
          name: '',
          indexSet: 0,
          onChainId: '',
          status: 'WON' as any,
        },
        oracleQuestionId: '',
        conditionId: '',
        resolverAddress: '',
        outcomes: [],
        questionIndex: 0,
        spreadThreshold: 0,
        shareThreshold: 0,
        polymarketConditionIds: [],
        kalshiMarketTicker: '',
        categorySlug: '',
        createdAt: '',
        decimalPrecision: 18,
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as any);

    const result = await service.getMarketById(1);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/markets/1',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(result).toEqual(mockResponse);
  });

  it('getOrderBookByMarketId should fetch and return order book', async () => {
    const mockResponse: GetOrderBookResponse = {
      success: true,
      data: {
        marketId: 1,
        updateTimestampMs: Date.now(),
        asks: [],
        bids: [],
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as any);

    const result = await service.getOrderBookByMarketId(1);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/markets/1/orderbook',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(result).toEqual(mockResponse);
  });

  it('getMarketStatistics should fetch and return stats', async () => {
    const mockResponse: MarketStatistics = {
      totalLiquidityUsd: 10,
      volumeTotalUsd: 1,
      volume24hUsd: 1,
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: mockResponse }),
    } as any);

    const result = await service.getMarketStatistics(1);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/markets/1/stats',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(result?.data).toEqual(mockResponse);
  });

  it('createOrder should post and return response', async () => {
    const mockCreateOrderBody: CreateOrderBody = {
      data: {
        pricePerShare: '1',
        strategy: 0 as any,
        slippageBps: '0',
        isFillOrKill: false,
        order: {
          hash: '',
          salt: '',
          maker: '',
          signer: '',
          taker: '',
          tokenId: '',
          makerAmount: '',
          takerAmount: '',
          expiration: '',
          nonce: '',
          feeRateBps: '',
          side: 0,
          signatureType: 0,
          signature: '',
        },
      },
    };

    const mockResponse: CreateOrderResponse = {
      success: true,
      data: {
        orderId: '1',
        orderHash: '',
        code: '',
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as any);

    const result = await service.createOrder(mockCreateOrderBody);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/orders',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(result).toEqual(mockResponse);
  });

  it('setApprovals should skip if already approved', async () => {
    const repo = predictRepository as any;
    repo.getWalletApprovalByWalletAddress.mockResolvedValue({ id: 1 });

    const result = await service.setApprovals();

    expect(repo.getWalletApprovalByWalletAddress).toHaveBeenCalledWith(
      '0xPredict',
    );
    expect(repo.saveWalletApprovals).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('setApprovals should call orderBuilder and persist approval', async () => {
    const repo = predictRepository as any;
    repo.getWalletApprovalByWalletAddress.mockResolvedValue(null);
    repo.saveWalletApprovals.mockResolvedValue({ id: 2 });

    (service as any).orderBuilder = {
      setApprovals: jest.fn().mockResolvedValue({
        success: true,
        transactions: [],
      }),
    };

    const result = await service.setApprovals();

    expect(repo.getWalletApprovalByWalletAddress).toHaveBeenCalledWith(
      '0xPredict',
    );
    expect((service as any).orderBuilder.setApprovals).toHaveBeenCalled();
    expect(repo.saveWalletApprovals).toHaveBeenCalledWith('0xPredict');
    expect(result).toEqual({
      success: true,
      transactions: [],
    });
  });
});
