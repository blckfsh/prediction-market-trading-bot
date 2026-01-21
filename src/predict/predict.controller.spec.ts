import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { MarketVariant, TradeOptions } from '../../lib/zenstack/models';
import { PredictController } from './predict.controller';
import { PredictService } from 'src/predict/predict.service';

jest.mock('src/predict/predict.service', () => ({
  PredictService: class PredictService {},
}));

describe('PredictController', () => {
  let controller: PredictController;
  let predictService: jest.Mocked<PredictService>;

  const tradeConfig = {
    id: 1,
    marketVariant: MarketVariant.DEFAULT,
    options: TradeOptions.BUY,
    amount: 100,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PredictController],
      providers: [
        {
          provide: PredictService,
          useValue: {
            getTradeConfigByMarketVariant: jest.fn(),
            createTradeConfig: jest.fn(),
            updateTradeConfigAmount: jest.fn(),
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

  describe('getTradeConfigByMarketVariant', () => {
    it('returns trade config when found', async () => {
      predictService.getTradeConfigByMarketVariant.mockResolvedValue(tradeConfig);

      await expect(
        controller.getTradeConfigByMarketVariant(MarketVariant.DEFAULT),
      ).resolves.toEqual(tradeConfig);

      expect(predictService.getTradeConfigByMarketVariant).toHaveBeenCalledWith(
        MarketVariant.DEFAULT,
      );
    });

    it('throws NotFoundException when missing', async () => {
      predictService.getTradeConfigByMarketVariant.mockResolvedValue(null);

      await expect(
        controller.getTradeConfigByMarketVariant(MarketVariant.DEFAULT),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createTradeConfig', () => {
    it('creates trade config via service', async () => {
      predictService.createTradeConfig.mockResolvedValue(tradeConfig);

      await expect(
        controller.createTradeConfig({
          marketVariant: MarketVariant.DEFAULT,
          options: TradeOptions.BUY,
          amount: 100,
        }),
      ).resolves.toEqual(tradeConfig);

      expect(predictService.createTradeConfig).toHaveBeenCalledWith(
        MarketVariant.DEFAULT,
        TradeOptions.BUY,
        100,
      );
    });
  });

  describe('updateTradeConfigAmount', () => {
    it('updates trade config amount via service', async () => {
      const updatedConfig = { ...tradeConfig, amount: 250 };
      predictService.updateTradeConfigAmount.mockResolvedValue(updatedConfig);

      await expect(
        controller.updateTradeConfigAmount(MarketVariant.DEFAULT, {
          amount: 250,
        }),
      ).resolves.toEqual(updatedConfig);

      expect(predictService.updateTradeConfigAmount).toHaveBeenCalledWith(
        MarketVariant.DEFAULT,
        250,
      );
    });
  });
});

