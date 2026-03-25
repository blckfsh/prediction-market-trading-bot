import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PredictService } from 'src/predict/predict.service';
import {
  CreateBuyPositionConfigBody,
  CreateSellPositionConfigBody,
  CreateSlugMatchRuleBody,
  UpdateBuyPositionConfigBody,
  UpdateSellPositionConfigBody,
  UpdateSlugMatchRuleBody,
} from 'src/dto/trade-config.dto';
import { AuthGuard } from 'src/common/guard/auth.guard';
import { normalizeMarketVariant } from 'src/predict/predict.market-variant';

@Controller('predict')
export class PredictController {
  constructor(private readonly predictService: PredictService) {}

  @Get('buy-position-config/:marketVariant/:slugWithSuffix')
  async getBuyPositionConfigByMarketVariant(
    @Param('marketVariant') marketVariant: string,
    @Param('slugWithSuffix') slugWithSuffix: string,
  ) {
    const normalizedVariant = normalizeMarketVariant(marketVariant);
    const buyConfig =
      await this.predictService.getBuyPositionConfigByMarketVariant(
        normalizedVariant,
        slugWithSuffix,
      );
    if (!buyConfig) {
      throw new NotFoundException(
        `Buy position config not found for marketVariant: ${normalizedVariant}, slugWithSuffix: ${slugWithSuffix}`,
      );
    }
    return buyConfig;
  }

  @Post('buy-position-config')
  @UseGuards(AuthGuard)
  async createBuyPositionConfig(@Body() body: CreateBuyPositionConfigBody) {
    const { marketVariant, slugWithSuffix, amount, entry, tradeType } = body;
    const normalizedVariant = normalizeMarketVariant(marketVariant);
    return this.predictService.createBuyPositionConfig(
      normalizedVariant,
      slugWithSuffix,
      amount,
      entry,
      tradeType,
    );
  }

  @Patch('buy-position-config/:marketVariant/:slugWithSuffix')
  @UseGuards(AuthGuard)
  async updateBuyPositionConfig(
    @Param('marketVariant') marketVariant: string,
    @Param('slugWithSuffix') slugWithSuffix: string,
    @Body() body: UpdateBuyPositionConfigBody,
  ) {
    const normalizedVariant = normalizeMarketVariant(marketVariant);
    return this.predictService.updateBuyPositionConfig(
      normalizedVariant,
      slugWithSuffix,
      body,
    );
  }

  @Get('sell-position-config/:marketVariant/:slugWithSuffix')
  async getSellPositionConfigByMarketVariant(
    @Param('marketVariant') marketVariant: string,
    @Param('slugWithSuffix') slugWithSuffix: string,
  ) {
    const normalizedVariant = normalizeMarketVariant(marketVariant);
    const sellConfig =
      await this.predictService.getSellPositionConfigByMarketVariant(
        normalizedVariant,
        slugWithSuffix,
      );
    if (!sellConfig) {
      throw new NotFoundException(
        `Sell position config not found for marketVariant: ${normalizedVariant}, slugWithSuffix: ${slugWithSuffix}`,
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
    const normalizedVariant = normalizeMarketVariant(marketVariant);
    return this.predictService.createSellPositionConfig(
      normalizedVariant,
      slugWithSuffix,
      stopLossPercentage,
      amountPercentage,
    );
  }

  @Patch('sell-position-config/:marketVariant/:slugWithSuffix')
  @UseGuards(AuthGuard)
  async updateSellPositionConfig(
    @Param('marketVariant') marketVariant: string,
    @Param('slugWithSuffix') slugWithSuffix: string,
    @Body() body: UpdateSellPositionConfigBody,
  ) {
    const normalizedVariant = normalizeMarketVariant(marketVariant);
    return this.predictService.updateSellPositionConfig(
      normalizedVariant,
      slugWithSuffix,
      body,
    );
  }

  @Get('slug-match-rules')
  async getAllSlugMatchRules() {
    return this.predictService.getAllSlugMatchRules();
  }

  @Post('slug-match-rule')
  @UseGuards(AuthGuard)
  async createSlugMatchRule(@Body() body: CreateSlugMatchRuleBody) {
    return this.predictService.createSlugMatchRule({
      marketVariant: body.marketVariant
        ? normalizeMarketVariant(body.marketVariant)
        : null,
      configKey: body.configKey,
      matchType: body.matchType,
      pattern: body.pattern,
      enabled: body.enabled,
      priority: body.priority,
    });
  }

  @Patch('slug-match-rule/:id')
  @UseGuards(AuthGuard)
  async updateSlugMatchRule(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateSlugMatchRuleBody,
  ) {
    return this.predictService.updateSlugMatchRule(id, {
      marketVariant:
        body.marketVariant !== undefined
          ? normalizeMarketVariant(body.marketVariant)
          : undefined,
      configKey: body.configKey,
      matchType: body.matchType,
      pattern: body.pattern,
      enabled: body.enabled,
      priority: body.priority,
    });
  }
}
