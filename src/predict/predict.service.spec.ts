import { Test, TestingModule } from '@nestjs/testing';
import { MarketVariant, TradeOptions } from '../../lib/zenstack/models';
import { PredictRepository } from './predict.repository';
import { PredictService } from './predict.service';

jest.mock('./predict.repository', () => ({
  PredictRepository: class PredictRepository {},
}));

describe('PredictService', () => {
  let service: PredictService;
  let predictRepository: jest.Mocked<PredictRepository>;

  const tradeConfig = {
    id: 1,
    marketVariant: MarketVariant.DEFAULT,
    options: TradeOptions.BUY,
    amount: 100,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictService,
        {
          provide: PredictRepository,
          useValue: {
            getTradeConfigByMarketVariant: jest.fn(),
            saveTradeConfig: jest.fn(),
            updateTradeConfigAmount: jest.fn(),
            getWalletApprovalByWalletAddress: jest.fn(),
            saveWalletApprovals: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(PredictService);
    predictRepository = module.get(PredictRepository);
  });

  it('gets trade config by market variant', async () => {
    predictRepository.getTradeConfigByMarketVariant.mockResolvedValue(
      tradeConfig,
    );

    await expect(
      service.getTradeConfigByMarketVariant(MarketVariant.DEFAULT),
    ).resolves.toEqual(tradeConfig);

    expect(predictRepository.getTradeConfigByMarketVariant).toHaveBeenCalledWith(
      MarketVariant.DEFAULT,
    );
  });

  it('creates trade config', async () => {
    predictRepository.saveTradeConfig.mockResolvedValue(tradeConfig);

    await expect(
      service.createTradeConfig(MarketVariant.DEFAULT, TradeOptions.BUY, 100),
    ).resolves.toEqual(tradeConfig);

    expect(predictRepository.saveTradeConfig).toHaveBeenCalledWith(
      MarketVariant.DEFAULT,
      TradeOptions.BUY,
      100,
    );
  });

  it('updates trade config amount', async () => {
    const updatedConfig = { ...tradeConfig, amount: 250 };
    predictRepository.updateTradeConfigAmount.mockResolvedValue(updatedConfig);

    await expect(
      service.updateTradeConfigAmount(MarketVariant.DEFAULT, 250),
    ).resolves.toEqual(updatedConfig);

    expect(predictRepository.updateTradeConfigAmount).toHaveBeenCalledWith(
      MarketVariant.DEFAULT,
      250,
    );
  });

  it('setReferralCode should post and return true', async () => {
    global.Headers = jest.fn(() => ({
      append: jest.fn(),
    })) as any;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(true),
    } as any);

    const result = await service.setReferralCode({
      baseUrl: 'https://api.example.com',
      apiKey: 'test-api-key',
      token: 'jwt-token',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/account/referral',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toBe(true);
  });

  it('setReferralCode should allow custom referral code', async () => {
    global.Headers = jest.fn(() => ({
      append: jest.fn(),
    })) as any;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(true),
    } as any);

    await service.setReferralCode({
      baseUrl: 'https://api.example.com',
      apiKey: 'test-api-key',
      token: 'jwt-token',
      referralCode: 'CUSTOM',
    });

    const requestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string,
    );
    expect(requestBody).toEqual({ referralCode: 'CUSTOM' });
  });

  it('setApprovals should skip when already approved', async () => {
    predictRepository.getWalletApprovalByWalletAddress.mockResolvedValue({
      id: 1,
    } as any);

    const result = await service.setApprovals({
      predictAccount: '0xPredict',
      orderBuilder: { setApprovals: jest.fn() } as any,
    });

    expect(result).toBeUndefined();
  });

  it('setApprovals should call orderBuilder and persist approval', async () => {
    predictRepository.getWalletApprovalByWalletAddress.mockResolvedValue(null);
    predictRepository.saveWalletApprovals.mockResolvedValue({ id: 2 } as any);
    const orderBuilder = {
      setApprovals: jest.fn().mockResolvedValue({
        success: true,
        transactions: [],
      }),
    };

    const result = await service.setApprovals({
      predictAccount: '0xPredict',
      orderBuilder: orderBuilder as any,
    });

    expect(orderBuilder.setApprovals).toHaveBeenCalled();
    expect(predictRepository.saveWalletApprovals).toHaveBeenCalledWith(
      '0xPredict',
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
      }),
    );
  });
});

