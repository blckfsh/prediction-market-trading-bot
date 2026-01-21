import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  ParseEnumPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PredictService } from 'src/predict/predict.service';
import { MarketVariant } from 'lib/zenstack/models';
import {
  CreateTradeConfigBody,
  UpdateTradeConfigAmountBody,
} from 'src/predict/dto/trade-config.dto';
import { AuthGuard } from 'src/common/guard/auth.guard';

@Controller('predict')
export class PredictController {
  constructor(private readonly predictService: PredictService) {}

  @Get('trade-config/:marketVariant')
  async getTradeConfigByMarketVariant(
    @Param('marketVariant', new ParseEnumPipe(MarketVariant))
    marketVariant: MarketVariant,
  ) {
    const tradeConfig =
      await this.predictService.getTradeConfigByMarketVariant(marketVariant);
    if (!tradeConfig) {
      throw new NotFoundException(
        `Trade config not found for marketVariant: ${marketVariant}`,
      );
    }
    return tradeConfig;
  }

  @Post('trade-config')
  @UseGuards(AuthGuard)
  async createTradeConfig(@Body() body: CreateTradeConfigBody) {
    const { marketVariant, options, amount } = body;
    return this.predictService.createTradeConfig(
      marketVariant,
      options,
      amount,
    );
  }

  @Patch('trade-config/:marketVariant/amount')
  @UseGuards(AuthGuard)
  async updateTradeConfigAmount(
    @Param('marketVariant', new ParseEnumPipe(MarketVariant))
    marketVariant: MarketVariant,
    @Body() body: UpdateTradeConfigAmountBody,
  ) {
    return this.predictService.updateTradeConfigAmount(
      marketVariant,
      body.amount,
    );
  }
}
