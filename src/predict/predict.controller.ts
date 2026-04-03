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
  CreateCryptoBetBody,
  CreateMarketProfileBody,
  CreateSellPositionConfigBody,
  CreateSportsBetBody,
  CreateSlugMatchRuleBody,
  UpdateCryptoBetBody,
  UpdateBuyPositionConfigBody,
  UpdateSellPositionConfigBody,
  UpdateSportsBetBody,
  UpdateSlugMatchRuleBody,
} from 'src/dto/trade-config.dto';
import { AuthGuard } from 'src/common/guard/auth.guard';
import { normalizeMarketVariant } from 'src/predict/predict.market-variant';

@Controller('predict')
export class PredictController {
  @Get('market-profiles')
  async getAllMarketProfiles() {
    return this.predictService.getAllMarketProfiles();
  }

  @Post('market-profile')
  @UseGuards(AuthGuard)
  async createMarketProfile(@Body() body: CreateMarketProfileBody) {
    return this.predictService.createMarketProfile(
      normalizeMarketVariant(body.marketVariant),
      body.configKey,
    );
  }

  @Get('sports-bets')
  async getAllSportsBets() {
    return this.predictService.getAllSportsBets();
  }

  @Post('sports-bet')
  @UseGuards(AuthGuard)
  async createSportsBet(@Body() body: CreateSportsBetBody) {
    return this.predictService.createSportsBet({
      marketVariant: normalizeMarketVariant(body.marketVariant),
      configKey: body.configKey,
      category: body.category,
      keyword: body.keyword,
      status: body.status,
      priority: body.priority,
      amount: body.amount,
      profitTakingPercentage: body.profitTakingPercentage,
    });
  }

  @Patch('sports-bet/:id')
  @UseGuards(AuthGuard)
  async updateSportsBet(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateSportsBetBody,
  ) {
    return this.predictService.updateSportsBet(id, {
      marketVariant:
        body.marketVariant !== undefined
          ? normalizeMarketVariant(body.marketVariant)
          : undefined,
      configKey: body.configKey,
      category: body.category,
      keyword: body.keyword,
      status: body.status,
      priority: body.priority,
      amount: body.amount,
      profitTakingPercentage: body.profitTakingPercentage,
    });
  }

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
    const { marketVariant, slugWithSuffix, entry, tradeType } = body;
    const normalizedVariant = normalizeMarketVariant(marketVariant);
    return this.predictService.createBuyPositionConfig(
      normalizedVariant,
      slugWithSuffix,
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
    // Backward-compatible alias for crypto-bets
    return this.predictService.getAllSlugMatchRules();
  }

  @Post('slug-match-rule')
  @UseGuards(AuthGuard)
  async createSlugMatchRule(@Body() body: CreateSlugMatchRuleBody) {
    // Backward-compatible alias for crypto-bet create
    return this.predictService.createSlugMatchRule({
      marketVariant: normalizeMarketVariant(body.marketVariant),
      configKey: body.configKey,
      matchType: body.matchType,
      pattern: body.pattern,
      status: body.status,
      enabled: body.enabled,
      priority: body.priority,
      amount: body.amount,
      profitTakingPercentage: body.profitTakingPercentage,
    });
  }

  @Patch('slug-match-rule/:id')
  @UseGuards(AuthGuard)
  async updateSlugMatchRule(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateSlugMatchRuleBody,
  ) {
    // Backward-compatible alias for crypto-bet update
    return this.predictService.updateSlugMatchRule(id, {
      marketVariant:
        body.marketVariant !== undefined
          ? normalizeMarketVariant(body.marketVariant)
          : undefined,
      configKey: body.configKey,
      matchType: body.matchType,
      pattern: body.pattern,
      status: body.status,
      enabled: body.enabled,
      priority: body.priority,
      amount: body.amount,
      profitTakingPercentage: body.profitTakingPercentage,
    });
  }

  @Get('crypto-bets')
  async getAllCryptoBets() {
    return this.predictService.getAllCryptoBets();
  }

  @Post('crypto-bet')
  @UseGuards(AuthGuard)
  async createCryptoBet(@Body() body: CreateCryptoBetBody) {
    return this.predictService.createCryptoBet({
      marketVariant: normalizeMarketVariant(body.marketVariant),
      configKey: body.configKey,
      matchType: body.matchType,
      pattern: body.pattern,
      status: body.status,
      enabled: body.enabled,
      priority: body.priority,
      amount: body.amount,
      profitTakingPercentage: body.profitTakingPercentage,
    });
  }

  @Patch('crypto-bet/:id')
  @UseGuards(AuthGuard)
  async updateCryptoBet(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCryptoBetBody,
  ) {
    return this.predictService.updateCryptoBet(id, {
      marketVariant:
        body.marketVariant !== undefined
          ? normalizeMarketVariant(body.marketVariant)
          : undefined,
      configKey: body.configKey,
      matchType: body.matchType,
      pattern: body.pattern,
      status: body.status,
      enabled: body.enabled,
      priority: body.priority,
      amount: body.amount,
      profitTakingPercentage: body.profitTakingPercentage,
    });
  }
}
