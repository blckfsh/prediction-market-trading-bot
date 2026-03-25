import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ZeroHash } from 'ethers';
import { PrismaService } from 'src/prisma/prisma.service';
import { SaveMarketTradeInput } from 'src/types/market.types';
import { MarketVariant } from 'lib/zenstack/models';
import { TradeStatus } from 'generated/prisma/client';
import type { BuyTradeType } from 'src/predict/buy-trade-type';
import { normalizeBuyTradeType } from 'src/predict/buy-trade-type';

type SportsBetRecord = {
  id: number;
  keyword: string;
  category: string;
};

type SlugMatchType = 'prefix' | 'suffix' | 'regex';

export type SlugMatchRuleRecord = {
  id: number;
  marketVariant: MarketVariant | null;
  configKey: string;
  matchType: SlugMatchType;
  pattern: string;
  enabled: boolean;
  priority: number;
};

@Injectable()
export class PredictRepository {
  constructor(private readonly prisma: PrismaService) {}

  private isMissingSlugMatchRuleTable(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const message = error.message.toLowerCase();
    return (
      message.includes('slugmatchrule') &&
      (message.includes('does not exist') || message.includes('undefined table'))
    );
  }

  private mapSlugMatchRuleRow(row: Record<string, unknown>): SlugMatchRuleRecord {
    const matchTypeRaw =
      typeof row.matchType === 'string' ? row.matchType.toLowerCase() : '';
    const normalizedMatchType: SlugMatchType =
      matchTypeRaw === 'prefix' ||
      matchTypeRaw === 'suffix' ||
      matchTypeRaw === 'regex'
        ? matchTypeRaw
        : 'suffix';
    return {
      id: Number(row.id),
      marketVariant:
        row.marketVariant === null
          ? null
          : (String(row.marketVariant) as MarketVariant),
      configKey: String(row.configKey),
      matchType: normalizedMatchType,
      pattern: String(row.pattern),
      enabled: Boolean(row.enabled),
      priority: Number(row.priority),
    };
  }

  async getTradeByMarketId(marketId: number) {
    return this.prisma.trade.findFirst({
      where: { marketId },
      orderBy: { buyTimestamp: 'desc' },
    });
  }

  async getActiveTradeByMarketId(marketId: number) {
    return this.prisma.trade.findFirst({
      where: {
        marketId,
        status: { not: TradeStatus.SOLD },
      },
      orderBy: { buyTimestamp: 'desc' },
    });
  }

  async getWalletApprovalByWalletAddress(walletAddress: string) {
    return this.prisma.walletApproval.findFirst({
      where: { walletAddress },
    });
  }

  async getBuyPositionConfigByMarketVariant(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
  ) {
    return this.prisma.buyPositionConfig.findFirst({
      where: { marketVariant, slugWithSuffix },
    });
  }

  async getAllBuyPositionConfigs() {
    return this.prisma.buyPositionConfig.findMany();
  }

  async getSellPositionConfigByMarketVariant(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
  ) {
    return this.prisma.sellPositionConfig.findFirst({
      where: { marketVariant, slugWithSuffix },
    });
  }

  async getAllSellPositionConfigs() {
    return this.prisma.sellPositionConfig.findMany();
  }

  async getAllSportsBets(): Promise<SportsBetRecord[]> {
    return this.prisma.$queryRawUnsafe<SportsBetRecord[]>(
      'SELECT id, keyword, category FROM "SportsBet"',
    );
  }

  async getAllSlugMatchRules(): Promise<SlugMatchRuleRecord[]> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        [
          'SELECT',
          '  id,',
          '  "marketVariant" AS "marketVariant",',
          '  "configKey" AS "configKey",',
          '  "matchType" AS "matchType",',
          '  pattern,',
          '  enabled,',
          '  priority',
          'FROM "SlugMatchRule"',
          'WHERE enabled = TRUE',
          'ORDER BY priority ASC, id ASC',
        ].join(' '),
      );
      return rows.map((row) => this.mapSlugMatchRuleRow(row));
    } catch (error) {
      if (this.isMissingSlugMatchRuleTable(error)) {
        return [];
      }
      throw error;
    }
  }

  async saveSlugMatchRule(params: {
    marketVariant: MarketVariant | null;
    configKey: string;
    matchType: SlugMatchType;
    pattern: string;
    enabled: boolean;
    priority: number;
  }): Promise<SlugMatchRuleRecord> {
    const { marketVariant, configKey, matchType, pattern, enabled, priority } =
      params;
    const existing = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      [
        'SELECT id FROM "SlugMatchRule"',
        'WHERE "marketVariant" IS NOT DISTINCT FROM $1',
        'AND "configKey" = $2',
        'AND "matchType" = $3',
        'AND pattern = $4',
        'LIMIT 1',
      ].join(' '),
      marketVariant,
      configKey,
      matchType,
      pattern,
    );
    if (existing.length > 0) {
      throw new ConflictException(
        `Slug match rule already exists for marketVariant: ${marketVariant ?? 'ANY'}, configKey: ${configKey}, matchType: ${matchType}, pattern: ${pattern}`,
      );
    }
    const inserted = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      [
        'INSERT INTO "SlugMatchRule"',
        '("marketVariant", "configKey", "matchType", pattern, enabled, priority)',
        'VALUES ($1, $2, $3, $4, $5, $6)',
        'RETURNING',
        '  id,',
        '  "marketVariant" AS "marketVariant",',
        '  "configKey" AS "configKey",',
        '  "matchType" AS "matchType",',
        '  pattern,',
        '  enabled,',
        '  priority',
      ].join(' '),
      marketVariant,
      configKey,
      matchType,
      pattern,
      enabled,
      priority,
    );
    return this.mapSlugMatchRuleRow(inserted[0]);
  }

  async updateSlugMatchRule(
    id: number,
    updates: {
      marketVariant?: MarketVariant | null;
      configKey?: string;
      matchType?: SlugMatchType;
      pattern?: string;
      enabled?: boolean;
      priority?: number;
    },
  ): Promise<SlugMatchRuleRecord> {
    const existing = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      [
        'SELECT',
        '  id,',
        '  "marketVariant" AS "marketVariant",',
        '  "configKey" AS "configKey",',
        '  "matchType" AS "matchType",',
        '  pattern,',
        '  enabled,',
        '  priority',
        'FROM "SlugMatchRule"',
        'WHERE id = $1',
        'LIMIT 1',
      ].join(' '),
      id,
    );
    if (existing.length === 0) {
      throw new NotFoundException(`Slug match rule not found for id: ${id}`);
    }
    const current = this.mapSlugMatchRuleRow(existing[0]);
    const next = {
      marketVariant:
        updates.marketVariant !== undefined
          ? updates.marketVariant
          : current.marketVariant,
      configKey:
        updates.configKey !== undefined ? updates.configKey : current.configKey,
      matchType:
        updates.matchType !== undefined ? updates.matchType : current.matchType,
      pattern: updates.pattern !== undefined ? updates.pattern : current.pattern,
      enabled: updates.enabled !== undefined ? updates.enabled : current.enabled,
      priority:
        updates.priority !== undefined ? updates.priority : current.priority,
    };
    const updated = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      [
        'UPDATE "SlugMatchRule"',
        'SET',
        '  "marketVariant" = $1,',
        '  "configKey" = $2,',
        '  "matchType" = $3,',
        '  pattern = $4,',
        '  enabled = $5,',
        '  priority = $6,',
        '  "updatedAt" = NOW()',
        'WHERE id = $7',
        'RETURNING',
        '  id,',
        '  "marketVariant" AS "marketVariant",',
        '  "configKey" AS "configKey",',
        '  "matchType" AS "matchType",',
        '  pattern,',
        '  enabled,',
        '  priority',
      ].join(' '),
      next.marketVariant,
      next.configKey,
      next.matchType,
      next.pattern,
      next.enabled,
      next.priority,
      id,
    );
    return this.mapSlugMatchRuleRow(updated[0]);
  }

  async saveMarketTrade({
    marketId,
    slug,
    buyAmount,
    buyAmountInUsd,
    buyOrderHash,
    buyTimestamp,
    status,
  }: SaveMarketTradeInput) {
    return this.prisma.trade.create({
      data: {
        marketId,
        slug,
        buyAmount,
        buyAmountInUsd,
        buyOrderHash: buyOrderHash ?? ZeroHash.toString(),
        buyTimestamp,
        status,
      },
    });
  }

  async updateMarketTradeStatus(
    tradeId: number,
    status: TradeStatus,
    sellOrderHash?: string,
  ) {
    return this.prisma.trade.update({
      where: { id: tradeId },
      data: {
        status,
        sellOrderHash: sellOrderHash ?? ZeroHash.toString(),
        sellTimestamp: new Date(),
      },
    });
  }

  async saveWalletApprovals(walletAddress: string) {
    return this.prisma.walletApproval.create({
      data: {
        walletAddress,
        timestamp: new Date(),
      },
    });
  }

  async saveBuyPositionConfig(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
    amount: number,
    entry: number,
    tradeType?: BuyTradeType,
  ) {
    const buyConfig = await this.getBuyPositionConfigByMarketVariant(
      marketVariant,
      slugWithSuffix,
    );
    if (buyConfig) {
      throw new ConflictException(
        `Buy position config already exists for marketVariant: ${marketVariant}, slugWithSuffix: ${slugWithSuffix}`,
      );
    }
    return this.prisma.buyPositionConfig.create({
      data: {
        marketVariant,
        slugWithSuffix,
        amount,
        entry,
        tradeType: normalizeBuyTradeType(tradeType, {
          defaultType:
            marketVariant === MarketVariant.SPORTS_TEAM_MATCH
              ? 'na'
              : 'avg-price',
        }),
      },
    });
  }

  async updateBuyPositionConfig(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
    updates: {
      amount?: number;
      entry?: number;
      tradeType?: BuyTradeType;
    },
  ) {
    const buyConfig = await this.getBuyPositionConfigByMarketVariant(
      marketVariant,
      slugWithSuffix,
    );
    if (!buyConfig) {
      throw new NotFoundException(
        `Buy position config not found for marketVariant: ${marketVariant}, slugWithSuffix: ${slugWithSuffix}`,
      );
    }
    return this.prisma.buyPositionConfig.update({
      where: { id: buyConfig.id },
      data: {
        ...updates,
        ...(updates.tradeType !== undefined
          ? { tradeType: normalizeBuyTradeType(updates.tradeType) }
          : {}),
      },
    });
  }

  async saveSellPositionConfig(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
    stopLossPercentage: number,
    amountPercentage: number,
  ) {
    const sellConfig = await this.getSellPositionConfigByMarketVariant(
      marketVariant,
      slugWithSuffix,
    );
    if (sellConfig) {
      throw new ConflictException(
        `Sell position config already exists for marketVariant: ${marketVariant}, slugWithSuffix: ${slugWithSuffix}`,
      );
    }
    return this.prisma.sellPositionConfig.create({
      data: {
        marketVariant,
        slugWithSuffix,
        stopLossPercentage,
        amountPercentage,
      },
    });
  }

  async updateSellPositionConfig(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
    updates: {
      stopLossPercentage?: number;
      amountPercentage?: number;
    },
  ) {
    const sellConfig = await this.getSellPositionConfigByMarketVariant(
      marketVariant,
      slugWithSuffix,
    );
    if (!sellConfig) {
      throw new NotFoundException(
        `Sell position config not found for marketVariant: ${marketVariant}, slugWithSuffix: ${slugWithSuffix}`,
      );
    }
    return this.prisma.sellPositionConfig.update({
      where: { id: sellConfig.id },
      data: updates,
    });
  }
}
