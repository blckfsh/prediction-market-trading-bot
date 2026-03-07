import { BotService } from './bot.service';
import { ConfigService } from '@nestjs/config';
import { PredictRepository } from 'src/predict/predict.repository';
import { PredictRealtimeService } from 'src/websocket/predict-realtime.service';
import { TradeService } from 'src/trade/trade.service';
import { RedeemService } from 'src/redeem/redeem.service';
import { PredictService } from 'src/predict/predict.service';
import {
  GetAllMarketsResponse,
  GetCategoriesByResponse,
  GetAllPositionsResponse,
  GetOrderBookResponse,
  MarketDataResponse,
  MarketStatistics,
  CreateOrderBody,
  CreateOrderResponse,
  SaveMarketTradeInput,
} from 'src/types/market.types';
import { RealtimeTopic } from 'src/types/websocket.types';
import { TradeStatus } from 'generated/prisma/client';
import { REFERRAL_CODE } from 'src/common/helpers/constants';

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

jest.mock('src/predict/predict.repository', () => {
  const MockRepo = jest.fn().mockImplementation(() => ({
    saveMarketTrade: jest.fn(),
    getTradeByMarketId: jest.fn(),
    updateMarketTradeStatus: jest.fn(),
  }));
  return { PredictRepository: MockRepo };
});

describe('BotService', () => {
  let service: BotService;
  let tradeService: TradeService;
  let redeemService: RedeemService;
  let predictService: PredictService;
  let configService: ConfigService;
  let predictRepository: PredictRepository;
  let websocketService: PredictRealtimeService;

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

    websocketService = {
      connect: jest.fn(),
      subscribe: jest.fn(),
    } as unknown as PredictRealtimeService;

    tradeService = new TradeService(predictRepository, configService);
    redeemService = new RedeemService();
    predictService = new PredictService(predictRepository);
    service = new BotService(
      configService,
      predictRepository,
      websocketService,
      tradeService,
      redeemService,
      predictService,
    );

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

    const result = await tradeService.createOrder({
      baseUrl: 'https://api.example.com',
      apiKey: 'test-api-key',
      token: 'jwt-token',
      createOrderBody: mockCreateOrderBody,
    });

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

    const result = await predictService.setApprovals({
      predictAccount: '0xPredict',
      orderBuilder: { setApprovals: jest.fn() } as any,
    });

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

    const orderBuilder = {
      setApprovals: jest.fn().mockResolvedValue({
        success: true,
        transactions: [],
      }),
    };

    const result = await predictService.setApprovals({
      predictAccount: '0xPredict',
      orderBuilder: orderBuilder as any,
    });

    expect(repo.getWalletApprovalByWalletAddress).toHaveBeenCalledWith(
      '0xPredict',
    );
    expect(orderBuilder.setApprovals).toHaveBeenCalled();
    expect(repo.saveWalletApprovals).toHaveBeenCalledWith('0xPredict');
    expect(result).toEqual({
      success: true,
      transactions: [],
    });
  });

  it('redeemStandardPosition should redeem and return result', async () => {
    const mockResult = {
      success: true,
      receipt: { transactionHash: '0xhash' },
    };

    const orderBuilder = {
      redeemPositions: jest.fn().mockResolvedValue(mockResult),
    };

    const result = await redeemService.redeemStandardPosition({
      orderBuilder: orderBuilder as any,
      conditionId: 'cond-1',
      indexSet: 1,
      isNegRisk: false,
      isYieldBearing: false,
    });

    expect(orderBuilder.redeemPositions).toHaveBeenCalledWith({
      conditionId: 'cond-1',
      indexSet: 1,
      isNegRisk: false,
      isYieldBearing: false,
    });
    expect(result).toEqual(mockResult);
  });

  it('redeemStandardPosition should throw when redeem fails', async () => {
    const mockResult = {
      success: false,
      cause: 'rejected',
    };

    const orderBuilder = {
      redeemPositions: jest.fn().mockResolvedValue(mockResult),
    };

    await expect(
      redeemService.redeemStandardPosition({
        orderBuilder: orderBuilder as any,
        conditionId: 'cond-2',
        indexSet: 2,
        isNegRisk: false,
        isYieldBearing: true,
      }),
    ).rejects.toThrow('Failed to redeem position: rejected');
  });

  it('redeemNegRiskPosition should redeem with amount', async () => {
    const mockResult = {
      success: true,
      receipt: { transactionHash: '0xhash' },
    };

    const orderBuilder = {
      redeemPositions: jest.fn().mockResolvedValue(mockResult),
    };

    const result = await redeemService.redeemNegRiskPosition({
      orderBuilder: orderBuilder as any,
      conditionId: 'cond-3',
      indexSet: 1,
      isNegRisk: true,
      isYieldBearing: true,
      amount: 100n,
    });

    expect(orderBuilder.redeemPositions).toHaveBeenCalledWith({
      conditionId: 'cond-3',
      indexSet: 1,
      amount: 100n,
      isNegRisk: true,
      isYieldBearing: true,
    });
    expect(result).toEqual(mockResult);
  });

  it('redeemNegRiskPosition should throw when redeem fails', async () => {
    const mockResult = {
      success: false,
      cause: 'failed',
    };

    const orderBuilder = {
      redeemPositions: jest.fn().mockResolvedValue(mockResult),
    };

    await expect(
      redeemService.redeemNegRiskPosition({
        orderBuilder: orderBuilder as any,
        conditionId: 'cond-4',
        indexSet: 2,
        isNegRisk: true,
        isYieldBearing: false,
        amount: 50n,
      }),
    ).rejects.toThrow('Failed to redeem position: failed');
  });

  it('setReferralCode should post and return true', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(true),
    } as any);

    const result = await predictService.setReferralCode({
      baseUrl: 'https://api.example.com',
      apiKey: 'test-api-key',
      token: 'jwt-token',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/account/referral',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    const requestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string,
    );
    expect(requestBody).toEqual({ referralCode: REFERRAL_CODE });
    expect(result).toBe(true);
  });

  it('setReferralCode should return false when response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve(false),
    } as any);

    const result = await predictService.setReferralCode({
      baseUrl: 'https://api.example.com',
      apiKey: 'test-api-key',
      token: 'jwt-token',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/account/referral',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(result).toBe(false);
  });

  it('logRealtimeEvent should trigger auto-trade from orderbook', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) =>
      key === 'PREDICT_WS_LOG_INTERVAL_MS' ? '0' : undefined,
    );

    const createTradeSpy = jest
      .spyOn(tradeService, 'createTradeFromOrderbook')
      .mockResolvedValue(undefined);

    await (service as any).logRealtimeEvent(
      { name: RealtimeTopic.PredictOrderbook, marketId: 1 },
      {
        marketId: 1,
        updateTimestampMs: Date.now(),
        asks: [],
        bids: [],
      },
    );

    expect(createTradeSpy).toHaveBeenCalled();
  });

  it('buyPosition should skip when price is not profitable after fees', async () => {
    const market: SaveMarketTradeInput = {
      marketId: 1,
      slug: 'cat',
      buyAmount: 1,
      buyAmountInUsd: 1,
      buyTimestamp: new Date(),
      status: TradeStatus.BOUGHT,
    };

    const repo = predictRepository as any;
    repo.getTradeByMarketId = jest.fn().mockResolvedValue(null);

    const getOrderBookByMarketId = jest.fn().mockResolvedValue({
      success: true,
      data: {
        marketId: 1,
        updateTimestampMs: Date.now(),
        asks: [[0.99, 1]],
        bids: [[0.02, 1]],
      },
    });

    const getMarketById = jest.fn().mockResolvedValue({
      success: true,
      data: {
        id: 1,
        feeRateBps: 100, // 1% fee makes max payout 0.99
        isNegRisk: false,
        isYieldBearing: false,
        decimalPrecision: 2,
        outcomes: [{ onChainId: '1' }, { onChainId: '2' }],
      },
    });

    const subscribeToOrderbook = jest.fn();

    const createOrderSpy = jest
      .fn()
      .mockResolvedValue({ success: true } as any);

    await (tradeService as any).buyPosition({
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

  it('evaluateStopLoss should skip resolved markets', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) =>
      key === 'PREDICT_LIMIT_LOSS_PERCENTAGE' ? '60' : undefined,
    );

    const positions = [
      {
        market: { id: 1, status: 'RESOLVED' },
        outcome: { onChainId: '1' },
        amount: '1000000000000000000',
        valueUsd: '40',
      },
      {
        market: { id: 2, status: 'OPEN' },
        outcome: { onChainId: '2' },
        amount: '1000000000000000000',
        valueUsd: '40',
      },
    ];

    const repo = predictRepository as any;
    repo.getTradeByMarketId = jest
      .fn()
      .mockResolvedValueOnce({
        id: 1,
        status: TradeStatus.BOUGHT,
        buyAmount: 100,
        buyAmountInUsd: 100,
      });

    const sellPositionSpy = jest
      .spyOn(tradeService as any, 'sellPosition')
      .mockResolvedValue(undefined);

    await tradeService.evaluateStopLoss({
      positions,
      getOrderBookByMarketId: jest.fn(),
      getMarketById: jest.fn(),
      subscribeToOrderbook: jest.fn(),
      getStopLossPercentageForMarketSlug: jest.fn().mockReturnValue(60),
      getAmountPercentageForMarketSlug: jest.fn().mockReturnValue(100),
      createOrder: jest.fn(),
      orderBuilder: {} as any,
      signer: { address: '0xSigner' } as any,
    });

    expect(sellPositionSpy).toHaveBeenCalledTimes(1);
    expect(sellPositionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        existingTrade: expect.objectContaining({ id: 1 }),
        position: expect.objectContaining({ market: { id: 2, status: 'OPEN' } }),
      }),
    );
  });

  it('evaluateStopLoss should skip sold trades', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) =>
      key === 'PREDICT_LIMIT_LOSS_PERCENTAGE' ? '60' : undefined,
    );

    const positions = [
      {
        market: { id: 3, status: 'OPEN' },
        outcome: { onChainId: '1' },
        amount: '1000000000000000000',
        valueUsd: '40',
      },
    ];

    const repo = predictRepository as any;
    repo.getTradeByMarketId = jest.fn().mockResolvedValue({
      id: 3,
      status: TradeStatus.SOLD,
      buyAmount: 100,
      buyAmountInUsd: 100,
    });

    const sellPositionSpy = jest
      .spyOn(tradeService as any, 'sellPosition')
      .mockResolvedValue(undefined);

    await tradeService.evaluateStopLoss({
      positions,
      getOrderBookByMarketId: jest.fn(),
      getMarketById: jest.fn(),
      subscribeToOrderbook: jest.fn(),
      getStopLossPercentageForMarketSlug: jest.fn().mockReturnValue(60),
      getAmountPercentageForMarketSlug: jest.fn().mockReturnValue(100),
      createOrder: jest.fn(),
      orderBuilder: {} as any,
      signer: { address: '0xSigner' } as any,
    });

    expect(sellPositionSpy).not.toHaveBeenCalled();
  });

  it('initializePositionTable should evaluate profit-taking and stop-loss', async () => {
    const getAllPositionsSpy = jest
      .spyOn(service as any, 'getAllPositions')
      .mockResolvedValue({
        success: true,
        cursor: '',
        data: [
          {
            market: { id: 1, status: 'OPEN' },
            outcome: { onChainId: '1' },
            amount: '1000000000000000000',
            valueUsd: '40',
          },
        ],
      });

    const profitTakingSpy = jest
      .spyOn(tradeService, 'evaluateProfitTaking')
      .mockResolvedValue(undefined);
    const stopLossSpy = jest
      .spyOn(tradeService, 'evaluateStopLoss')
      .mockResolvedValue(undefined);

    await (service as any).initializePositionTable();

    expect(getAllPositionsSpy).toHaveBeenCalled();
    expect(profitTakingSpy).toHaveBeenCalled();
    expect(stopLossSpy).toHaveBeenCalled();
  });

  it('initializePositionTable should skip evaluations when no positions', async () => {
    const getAllPositionsSpy = jest
      .spyOn(service as any, 'getAllPositions')
      .mockResolvedValue({
        success: true,
        cursor: '',
        data: [],
      });

    const profitTakingSpy = jest
      .spyOn(tradeService, 'evaluateProfitTaking')
      .mockResolvedValue(undefined);
    const stopLossSpy = jest
      .spyOn(tradeService, 'evaluateStopLoss')
      .mockResolvedValue(undefined);

    await (service as any).initializePositionTable();

    expect(getAllPositionsSpy).toHaveBeenCalled();
    expect(profitTakingSpy).not.toHaveBeenCalled();
    expect(stopLossSpy).not.toHaveBeenCalled();
  });
});
