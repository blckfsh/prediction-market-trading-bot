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
  CreateBuyPositionConfigBody,
  CreateSellPositionConfigBody,
  UpdateBuyPositionConfigBody,
  UpdateSellPositionConfigBody,
} from 'src/predict/dto/trade-config.dto';
import { AuthGuard } from 'src/common/guard/auth.guard';

@Controller('predict')
export class PredictController {
  constructor(private readonly predictService: PredictService) {}

  @Get('buy-position-config/:marketVariant/:slugWithSuffix')
  async getBuyPositionConfigByMarketVariant(
    @Param('marketVariant', new ParseEnumPipe(MarketVariant))
    marketVariant: MarketVariant,
    @Param('slugWithSuffix') slugWithSuffix: string,
  ) {
    const buyConfig =
      await this.predictService.getBuyPositionConfigByMarketVariant(
        marketVariant,
        slugWithSuffix,
      );
    if (!buyConfig) {
      throw new NotFoundException(
        `Buy position config not found for marketVariant: ${marketVariant}, slugWithSuffix: ${slugWithSuffix}`,
      );
    }
    return buyConfig;
  }

  @Post('buy-position-config')
  @UseGuards(AuthGuard)
  async createBuyPositionConfig(@Body() body: CreateBuyPositionConfigBody) {
    const { marketVariant, slugWithSuffix, amount, entry } = body;
    return this.predictService.createBuyPositionConfig(
      marketVariant,
      slugWithSuffix,
      amount,
      entry,
    );
  }

  @Patch('buy-position-config/:marketVariant/:slugWithSuffix')
  @UseGuards(AuthGuard)
  async updateBuyPositionConfig(
    @Param('marketVariant', new ParseEnumPipe(MarketVariant))
    marketVariant: MarketVariant,
    @Param('slugWithSuffix') slugWithSuffix: string,
    @Body() body: UpdateBuyPositionConfigBody,
  ) {
    return this.predictService.updateBuyPositionConfig(
      marketVariant,
      slugWithSuffix,
      body,
    );
  }

  @Get('sell-position-config/:marketVariant/:slugWithSuffix')
  async getSellPositionConfigByMarketVariant(
    @Param('marketVariant', new ParseEnumPipe(MarketVariant))
    marketVariant: MarketVariant,
    @Param('slugWithSuffix') slugWithSuffix: string,
  ) {
    const sellConfig =
      await this.predictService.getSellPositionConfigByMarketVariant(
        marketVariant,
        slugWithSuffix,
      );
    if (!sellConfig) {
      throw new NotFoundException(
        `Sell position config not found for marketVariant: ${marketVariant}, slugWithSuffix: ${slugWithSuffix}`,
      );
    }
    return sellConfig;
  }

  @Post('sell-position-config')
  @UseGuards(AuthGuard)
  async createSellPositionConfig(@Body() body: CreateSellPositionConfigBody) {
    const {
      marketVariant,
      slugWithSuffix,
      stopLossPercentage,
      amountPercentage,
    } = body;
    return this.predictService.createSellPositionConfig(
      marketVariant,
      slugWithSuffix,
      stopLossPercentage,
      amountPercentage,
    );
  }

  @Patch('sell-position-config/:marketVariant/:slugWithSuffix')
  @UseGuards(AuthGuard)
  async updateSellPositionConfig(
    @Param('marketVariant', new ParseEnumPipe(MarketVariant))
    marketVariant: MarketVariant,
    @Param('slugWithSuffix') slugWithSuffix: string,
    @Body() body: UpdateSellPositionConfigBody,
  ) {
    return this.predictService.updateSellPositionConfig(
      marketVariant,
      slugWithSuffix,
      body,
    );
  }
}
