import { Injectable } from '@nestjs/common';
import { TradeConfig } from 'generated/prisma/client';
import { MarketVariant, TradeOptions } from 'lib/zenstack/models';
import { PredictRepository } from './predict.repository';

@Injectable()
export class PredictService {
  constructor(private readonly predictRepository: PredictRepository) {}

  async getTradeConfigByMarketVariant(
    marketVariant: MarketVariant,
  ): Promise<TradeConfig | null> {
    return this.predictRepository.getTradeConfigByMarketVariant(marketVariant);
  }

  async createTradeConfig(
    marketVariant: MarketVariant,
    options: TradeOptions,
    amount: number,
  ): Promise<TradeConfig> {
    return this.predictRepository.saveTradeConfig(
      marketVariant,
      options,
      amount,
    );
  }

  async updateTradeConfigAmount(
    marketVariant: MarketVariant,
    amount: number,
  ): Promise<TradeConfig> {
    return this.predictRepository.updateTradeConfigAmount(
      marketVariant,
      amount,
    );
  }
}
