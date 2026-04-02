import { Test, TestingModule } from '@nestjs/testing';
import { MarketVariant } from '../../lib/zenstack/models';
import { PredictRepository } from './predict.repository';
import { PredictService } from './predict.service';

jest.mock('./predict.repository', () => ({
  PredictRepository: class PredictRepository {},
}));

describe('PredictService', () => {
  let service: PredictService;
  let predictRepository: jest.Mocked<PredictRepository>;

  const buyConfig = {
    id: 1,
    marketVariant: MarketVariant.DEFAULT,
    slugWithSuffix: 'crypto-up-down-1',
    amount: 100,
    entry: 25,
    tradeType: 'avg-price',
  };

  const sellConfig = {
    id: 2,
    marketVariant: MarketVariant.DEFAULT,
    slugWithSuffix: 'crypto-up-down-1',
    stopLossPercentage: 15,
    amountPercentage: 50,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictService,
        {
          provide: PredictRepository,
          useValue: {
            getBuyPositionConfigByMarketVariant: jest.fn(),
            saveBuyPositionConfig: jest.fn(),
            updateBuyPositionConfig: jest.fn(),
            getSellPositionConfigByMarketVariant: jest.fn(),
            saveSellPositionConfig: jest.fn(),
            updateSellPositionConfig: jest.fn(),
            getAllSlugMatchRules: jest.fn(),
            saveSlugMatchRule: jest.fn(),
            updateSlugMatchRule: jest.fn(),
            getWalletApprovalByWalletAddress: jest.fn(),
            saveWalletApprovals: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(PredictService);
    predictRepository = module.get(PredictRepository);
  });

  it('gets buy position config by market variant', async () => {
    predictRepository.getBuyPositionConfigByMarketVariant.mockResolvedValue(
      buyConfig,
    );

    await expect(
      service.getBuyPositionConfigByMarketVariant(
        MarketVariant.DEFAULT,
        'crypto-up-down-1',
      ),
    ).resolves.toEqual(buyConfig);

    expect(
      predictRepository.getBuyPositionConfigByMarketVariant,
    ).toHaveBeenCalledWith(MarketVariant.DEFAULT, 'crypto-up-down-1');
  });

  it('creates buy position config', async () => {
    predictRepository.saveBuyPositionConfig.mockResolvedValue(buyConfig);

    await expect(
      service.createBuyPositionConfig(
        MarketVariant.DEFAULT,
        'crypto-up-down-1',
        100,
        25,
        'yes',
      ),
    ).resolves.toEqual(buyConfig);

    expect(predictRepository.saveBuyPositionConfig).toHaveBeenCalledWith(
      MarketVariant.DEFAULT,
      'crypto-up-down-1',
      100,
      25,
      'yes',
    );
  });

  it('updates buy position config', async () => {
    const updatedConfig = { ...buyConfig, amount: 250, entry: 30 };
    predictRepository.updateBuyPositionConfig.mockResolvedValue(updatedConfig);

    await expect(
      service.updateBuyPositionConfig(
        MarketVariant.DEFAULT,
        'crypto-up-down-1',
        {
          amount: 250,
          entry: 30,
          tradeType: 'no',
        },
      ),
    ).resolves.toEqual(updatedConfig);

    expect(predictRepository.updateBuyPositionConfig).toHaveBeenCalledWith(
      MarketVariant.DEFAULT,
      'crypto-up-down-1',
      { amount: 250, entry: 30, tradeType: 'no' },
    );
  });

  it('gets sell position config by market variant', async () => {
    predictRepository.getSellPositionConfigByMarketVariant.mockResolvedValue(
      sellConfig,
    );

    await expect(
      service.getSellPositionConfigByMarketVariant(
        MarketVariant.DEFAULT,
        'crypto-up-down-1',
      ),
    ).resolves.toEqual(sellConfig);

    expect(
      predictRepository.getSellPositionConfigByMarketVariant,
    ).toHaveBeenCalledWith(MarketVariant.DEFAULT, 'crypto-up-down-1');
  });

  it('creates sell position config', async () => {
    predictRepository.saveSellPositionConfig.mockResolvedValue(sellConfig);

    await expect(
      service.createSellPositionConfig(
        MarketVariant.DEFAULT,
        'crypto-up-down-1',
        15,
        50,
      ),
    ).resolves.toEqual(sellConfig);

    expect(predictRepository.saveSellPositionConfig).toHaveBeenCalledWith(
      MarketVariant.DEFAULT,
      'crypto-up-down-1',
      15,
      50,
    );
  });

  it('updates sell position config', async () => {
    const updatedConfig = { ...sellConfig, stopLossPercentage: 20 };
    predictRepository.updateSellPositionConfig.mockResolvedValue(updatedConfig);

    await expect(
      service.updateSellPositionConfig(
        MarketVariant.DEFAULT,
        'crypto-up-down-1',
        {
          stopLossPercentage: 20,
        },
      ),
    ).resolves.toEqual(updatedConfig);

    expect(predictRepository.updateSellPositionConfig).toHaveBeenCalledWith(
      MarketVariant.DEFAULT,
      'crypto-up-down-1',
      { stopLossPercentage: 20 },
    );
  });

  it('gets slug match rules', async () => {
    const rules = [
      {
        id: 1,
        marketVariant: MarketVariant.CRYPTO_UP_DOWN,
        configKey: 'daily',
        matchType: 'regex',
        pattern: '^bitcoin-up-or-down-on-[a-z]+-\\d{1,2}-\\d{4}$',
        enabled: true,
        priority: 10,
      },
    ];
    predictRepository.getAllSlugMatchRules.mockResolvedValue(rules as any);

    await expect(service.getAllSlugMatchRules()).resolves.toEqual(rules);
    expect(predictRepository.getAllSlugMatchRules).toHaveBeenCalled();
  });

  it('creates slug match rule with defaults', async () => {
    const created = {
      id: 2,
      marketVariant: MarketVariant.CRYPTO_UP_DOWN,
      configKey: 'daily',
      matchType: 'suffix',
      pattern: 'daily',
      enabled: true,
      priority: 100,
    };
    predictRepository.saveSlugMatchRule.mockResolvedValue(created as any);

    await expect(
      service.createSlugMatchRule({
        marketVariant: MarketVariant.CRYPTO_UP_DOWN,
        configKey: 'daily',
        matchType: 'suffix',
        pattern: 'daily',
      }),
    ).resolves.toEqual(created);
    expect(predictRepository.saveSlugMatchRule).toHaveBeenCalledWith({
      marketVariant: MarketVariant.CRYPTO_UP_DOWN,
      configKey: 'daily',
      matchType: 'suffix',
      pattern: 'daily',
      status: undefined,
      enabled: true,
      priority: 100,
    });
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
