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
});

