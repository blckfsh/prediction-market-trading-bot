import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { MarketVariant } from '../../lib/zenstack/models';
import { PredictController } from './predict.controller';
import { PredictService } from 'src/predict/predict.service';

jest.mock('src/predict/predict.service', () => ({
  PredictService: class PredictService {},
}));

describe('PredictController', () => {
  let controller: PredictController;
  let predictService: jest.Mocked<PredictService>;

  const buyConfig = {
    id: 1,
    marketVariant: MarketVariant.DEFAULT,
    slugWithSuffix: 'crypto-up-down-1',
    amount: 100,
    entry: 25,
    tradeType: 'greater-than-no',
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
      controllers: [PredictController],
      providers: [
        {
          provide: PredictService,
          useValue: {
            getBuyPositionConfigByMarketVariant: jest.fn(),
            createBuyPositionConfig: jest.fn(),
            updateBuyPositionConfig: jest.fn(),
            getSellPositionConfigByMarketVariant: jest.fn(),
            createSellPositionConfig: jest.fn(),
            updateSellPositionConfig: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-api-key'),
          },
        },
      ],
    }).compile();

    controller = module.get<PredictController>(PredictController);
    predictService = module.get(PredictService);
  });

  describe('getBuyPositionConfigByMarketVariant', () => {
    it('returns buy position config when found', async () => {
      predictService.getBuyPositionConfigByMarketVariant.mockResolvedValue(
        buyConfig,
      );

      await expect(
        controller.getBuyPositionConfigByMarketVariant(
          MarketVariant.DEFAULT,
          'crypto-up-down-1',
        ),
      ).resolves.toEqual(buyConfig);

      expect(
        predictService.getBuyPositionConfigByMarketVariant,
      ).toHaveBeenCalledWith(MarketVariant.DEFAULT, 'crypto-up-down-1');
    });

    it('throws NotFoundException when missing', async () => {
      predictService.getBuyPositionConfigByMarketVariant.mockResolvedValue(null);

      await expect(
        controller.getBuyPositionConfigByMarketVariant(
          MarketVariant.DEFAULT,
          'crypto-up-down-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createBuyPositionConfig', () => {
    it('creates buy position config via service', async () => {
      predictService.createBuyPositionConfig.mockResolvedValue(buyConfig);

      await expect(
        controller.createBuyPositionConfig({
          marketVariant: MarketVariant.DEFAULT,
          slugWithSuffix: 'crypto-up-down-1',
          amount: 100,
          entry: 25,
          tradeType: 'yes',
        }),
      ).resolves.toEqual(buyConfig);

      expect(predictService.createBuyPositionConfig).toHaveBeenCalledWith(
        MarketVariant.DEFAULT,
        'crypto-up-down-1',
        100,
        25,
        'yes',
      );
    });
  });

  describe('updateBuyPositionConfig', () => {
    it('updates buy position config via service', async () => {
      const updatedConfig = { ...buyConfig, amount: 250 };
      predictService.updateBuyPositionConfig.mockResolvedValue(updatedConfig);

      await expect(
        controller.updateBuyPositionConfig(
          MarketVariant.DEFAULT,
          'crypto-up-down-1',
          { amount: 250, tradeType: 'no' },
        ),
      ).resolves.toEqual(updatedConfig);

      expect(predictService.updateBuyPositionConfig).toHaveBeenCalledWith(
        MarketVariant.DEFAULT,
        'crypto-up-down-1',
        { amount: 250, tradeType: 'no' },
      );
    });
  });

  describe('getSellPositionConfigByMarketVariant', () => {
    it('returns sell position config when found', async () => {
      predictService.getSellPositionConfigByMarketVariant.mockResolvedValue(
        sellConfig,
      );

      await expect(
        controller.getSellPositionConfigByMarketVariant(
          MarketVariant.DEFAULT,
          'crypto-up-down-1',
        ),
      ).resolves.toEqual(sellConfig);

      expect(
        predictService.getSellPositionConfigByMarketVariant,
      ).toHaveBeenCalledWith(MarketVariant.DEFAULT, 'crypto-up-down-1');
    });

    it('throws NotFoundException when missing', async () => {
      predictService.getSellPositionConfigByMarketVariant.mockResolvedValue(null);

      await expect(
        controller.getSellPositionConfigByMarketVariant(
          MarketVariant.DEFAULT,
          'crypto-up-down-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createSellPositionConfig', () => {
    it('creates sell position config via service', async () => {
      predictService.createSellPositionConfig.mockResolvedValue(sellConfig);

      await expect(
        controller.createSellPositionConfig({
          marketVariant: MarketVariant.DEFAULT,
          slugWithSuffix: 'crypto-up-down-1',
          stopLossPercentage: 15,
          amountPercentage: 50,
        }),
      ).resolves.toEqual(sellConfig);

      expect(predictService.createSellPositionConfig).toHaveBeenCalledWith(
        MarketVariant.DEFAULT,
        'crypto-up-down-1',
        15,
        50,
      );
    });
  });

  describe('updateSellPositionConfig', () => {
    it('updates sell position config via service', async () => {
      const updatedConfig = { ...sellConfig, stopLossPercentage: 20 };
      predictService.updateSellPositionConfig.mockResolvedValue(updatedConfig);

      await expect(
        controller.updateSellPositionConfig(
          MarketVariant.DEFAULT,
          'crypto-up-down-1',
          { stopLossPercentage: 20 },
        ),
      ).resolves.toEqual(updatedConfig);

      expect(predictService.updateSellPositionConfig).toHaveBeenCalledWith(
        MarketVariant.DEFAULT,
        'crypto-up-down-1',
        { stopLossPercentage: 20 },
      );
    });
  });
});

