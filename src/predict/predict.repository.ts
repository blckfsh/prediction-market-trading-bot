import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ZeroHash } from 'ethers';
import { PrismaService } from 'src/prisma/prisma.service';
import { SaveMarketTradeInput } from 'src/types/market.types';
import { MarketVariant } from 'lib/zenstack/models';
import { TradeStatus } from '@prisma/client';
import type { BuyTradeType } from 'src/predict/buy-trade-type';
import { normalizeBuyTradeType } from 'src/predict/buy-trade-type';

export type SportsBetRecord = {
  id: number;
  marketVariant: MarketVariant;
  configKey: string;
  keyword: string;
  category: string;
  priority: number;
  amount: number;
  profitTakingPercentage: number | null;
  status?: 'ACTIVE' | 'INACTIVE';
};

type SlugMatchType = 'prefix' | 'suffix' | 'regex';
type DbSlugMatchType = 'PREFIX' | 'SUFFIX' | 'REGEX';
type DbBuyTradeType = 'YES' | 'NO' | 'AVG_PRICE' | 'NA';

export type BuyPositionConfigRecord = {
  id: number;
  marketVariant: MarketVariant;
  slugWithSuffix: string;
  entry: number;
  tradeType: BuyTradeType;
};

export type SellPositionConfigRecord = {
  id: number;
  marketVariant: MarketVariant;
  slugWithSuffix: string;
  stopLossPercentage: number;
  amountPercentage: number;
};

export type SlugMatchRuleRecord = {
  id: number;
  marketVariant: MarketVariant;
  configKey: string;
  matchType: SlugMatchType;
  pattern: string;
  amount: number;
  profitTakingPercentage: number | null;
  status?: 'ACTIVE' | 'INACTIVE';
  enabled: boolean;
  priority: number;
};

export type MarketProfileRecord = {
  id: number;
  marketVariant: MarketVariant;
  configKey: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class PredictRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDbBuyTradeType(value: BuyTradeType): DbBuyTradeType {
    switch (value) {
      case 'yes':
        return 'YES';
      case 'no':
        return 'NO';
      case 'avg-price':
        return 'AVG_PRICE';
      case 'na':
        return 'NA';
    }
  }

  private fromDbBuyTradeType(value: string | null | undefined): BuyTradeType {
    const raw = value?.toUpperCase() ?? '';
    switch (raw) {
      case 'YES':
        return 'yes';
      case 'NO':
        return 'no';
      case 'NA':
        return 'na';
      case 'AVG_PRICE':
      default:
        return 'avg-price';
    }
  }

  private toDbSlugMatchType(value: SlugMatchType): DbSlugMatchType {
    switch (value) {
      case 'prefix':
        return 'PREFIX';
      case 'suffix':
        return 'SUFFIX';
      case 'regex':
        return 'REGEX';
    }
  }

  private fromDbSlugMatchType(value: string): SlugMatchType {
    const normalized = value.toUpperCase();
    switch (normalized) {
      case 'PREFIX':
        return 'prefix';
      case 'REGEX':
        return 'regex';
      case 'SUFFIX':
      default:
        return 'suffix';
    }
  }

  private parseManagedTradeSlug(slug: string): {
    marketSlug: string | null;
    outcomeOnChainId: string | null;
  } {
    const marker = '::outcome:';
    const markerIndex = slug.indexOf(marker);
    if (markerIndex < 0) {
      return { marketSlug: slug, outcomeOnChainId: null };
    }
    const marketSlug = slug.slice(0, markerIndex);
    const outcomeOnChainId = slug.slice(markerIndex + marker.length);
    return {
      marketSlug: marketSlug || null,
      outcomeOnChainId: outcomeOnChainId || null,
    };
  }

  private async getMarketProfileByVariantAndKey(
    marketVariant: MarketVariant,
    configKey: string,
  ) {
    return this.prisma.marketProfile.findUnique({
      where: {
        marketVariant_configKey: {
          marketVariant,
          configKey,
        },
      },
    });
  }

  private async ensureMarketProfile(
    marketVariant: MarketVariant,
    configKey: string,
  ) {
    return this.prisma.marketProfile.upsert({
      where: {
        marketVariant_configKey: {
          marketVariant,
          configKey,
        },
      },
      update: {},
      create: {
        marketVariant,
        configKey,
      },
    });
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

  async getAllMarketProfiles(): Promise<MarketProfileRecord[]> {
    const rows = await this.prisma.marketProfile.findMany({
      orderBy: [{ marketVariant: 'asc' }, { configKey: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      marketVariant: row.marketVariant as MarketVariant,
      configKey: row.configKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async saveMarketProfile(
    marketVariant: MarketVariant,
    configKey: string,
  ): Promise<MarketProfileRecord> {
    const existing = await this.getMarketProfileByVariantAndKey(
      marketVariant,
      configKey,
    );
    if (existing) {
      throw new ConflictException(
        `Market profile already exists for marketVariant: ${marketVariant}, configKey: ${configKey}`,
      );
    }
    const created = await this.prisma.marketProfile.create({
      data: {
        marketVariant,
        configKey,
      },
    });
    return {
      id: created.id,
      marketVariant: created.marketVariant as MarketVariant,
      configKey: created.configKey,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async getBuyPositionConfigByMarketVariant(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
  ): Promise<BuyPositionConfigRecord | null> {
    const profile = await this.getMarketProfileByVariantAndKey(
      marketVariant,
      slugWithSuffix,
    );
    if (!profile) {
      return null;
    }
    const config = await this.prisma.buyPositionConfig.findUnique({
      where: { marketProfileId: profile.id },
    });
    if (!config) {
      return null;
    }
    return {
      id: config.id,
      marketVariant: profile.marketVariant as MarketVariant,
      slugWithSuffix: profile.configKey,
      entry: config.entry,
      tradeType: this.fromDbBuyTradeType(String(config.tradeType)),
    };
  }

  async getAllBuyPositionConfigs(): Promise<BuyPositionConfigRecord[]> {
    const rows = await this.prisma.buyPositionConfig.findMany({
      include: { marketProfile: true },
    });
    return rows.map((row) => ({
      id: row.id,
      marketVariant: row.marketProfile.marketVariant as MarketVariant,
      slugWithSuffix: row.marketProfile.configKey,
      entry: row.entry,
      tradeType: this.fromDbBuyTradeType(String(row.tradeType)),
    }));
  }

  async getSellPositionConfigByMarketVariant(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
  ): Promise<SellPositionConfigRecord | null> {
    const profile = await this.getMarketProfileByVariantAndKey(
      marketVariant,
      slugWithSuffix,
    );
    if (!profile) {
      return null;
    }
    const config = await this.prisma.sellPositionConfig.findUnique({
      where: { marketProfileId: profile.id },
    });
    if (!config) {
      return null;
    }
    return {
      id: config.id,
      marketVariant: profile.marketVariant as MarketVariant,
      slugWithSuffix: profile.configKey,
      stopLossPercentage: config.stopLossPercentage,
      amountPercentage: config.amountPercentage,
    };
  }

  async getAllSellPositionConfigs(): Promise<SellPositionConfigRecord[]> {
    const rows = await this.prisma.sellPositionConfig.findMany({
      include: { marketProfile: true },
    });
    return rows.map((row) => ({
      id: row.id,
      marketVariant: row.marketProfile.marketVariant as MarketVariant,
      slugWithSuffix: row.marketProfile.configKey,
      stopLossPercentage: row.stopLossPercentage,
      amountPercentage: row.amountPercentage,
    }));
  }

  async getAllSportsBets(): Promise<SportsBetRecord[]> {
    const rows = await this.prisma.sportsBet.findMany({
      where: {
        marketProfile: {
          marketVariant: MarketVariant.SPORTS_TEAM_MATCH,
        },
      },
      include: { marketProfile: true, betRuleConfig: true },
      orderBy: [{ betRuleConfig: { priority: 'asc' } }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      marketVariant: row.marketProfile.marketVariant as MarketVariant,
      configKey: row.marketProfile.configKey,
      keyword: row.keyword,
      category: row.category,
      priority: row.betRuleConfig.priority,
      amount: row.betRuleConfig.amount,
      profitTakingPercentage: row.betRuleConfig.profitTakingPercentage,
      status: row.betRuleConfig.status as 'ACTIVE' | 'INACTIVE',
    }));
  }

  async saveSportsBet(params: {
    marketVariant: MarketVariant;
    configKey: string;
    keyword: string;
    category: string;
    status?: 'ACTIVE' | 'INACTIVE';
    priority?: number;
    amount: number;
    profitTakingPercentage?: number;
  }): Promise<SportsBetRecord> {
    const {
      marketVariant,
      configKey,
      keyword,
      category,
      status,
      priority,
      amount,
      profitTakingPercentage,
    } = params;
    const profile = await this.ensureMarketProfile(marketVariant, configKey);
    const existing = await this.prisma.sportsBet.findFirst({
      where: {
        marketProfileId: profile.id,
        category,
        keyword,
      },
    });
    if (existing) {
      throw new ConflictException(
        `Sports bet already exists for marketVariant: ${marketVariant}, configKey: ${configKey}, category: ${category}, keyword: ${keyword}`,
      );
    }
    const created = await this.prisma.sportsBet.create({
      data: {
        marketProfile: {
          connect: { id: profile.id },
        },
        category,
        keyword,
        betRuleConfig: {
          create: {
            status: status ?? 'ACTIVE',
            priority: priority ?? 100,
            amount,
            profitTakingPercentage,
          },
        },
      },
      include: { marketProfile: true, betRuleConfig: true },
    });
    return {
      id: created.id,
      marketVariant: created.marketProfile.marketVariant as MarketVariant,
      configKey: created.marketProfile.configKey,
      category: created.category,
      keyword: created.keyword,
      priority: created.betRuleConfig.priority,
      amount: created.betRuleConfig.amount,
      profitTakingPercentage: created.betRuleConfig.profitTakingPercentage,
      status: created.betRuleConfig.status as 'ACTIVE' | 'INACTIVE',
    };
  }

  async updateSportsBet(
    id: number,
    updates: {
      marketVariant?: MarketVariant;
      configKey?: string;
      keyword?: string;
      category?: string;
      status?: 'ACTIVE' | 'INACTIVE';
      priority?: number;
      amount?: number;
      profitTakingPercentage?: number;
    },
  ): Promise<SportsBetRecord> {
    const existing = await this.prisma.sportsBet.findUnique({
      where: { id },
      include: { marketProfile: true },
    });
    if (!existing) {
      throw new NotFoundException(`Sports bet not found for id: ${id}`);
    }

    let nextMarketProfileId = existing.marketProfileId;
    const nextMarketVariant =
      updates.marketVariant ?? existing.marketProfile.marketVariant;
    const nextConfigKey = updates.configKey ?? existing.marketProfile.configKey;
    if (
      nextMarketVariant !== existing.marketProfile.marketVariant ||
      nextConfigKey !== existing.marketProfile.configKey
    ) {
      const profile = await this.ensureMarketProfile(
        nextMarketVariant as MarketVariant,
        nextConfigKey,
      );
      nextMarketProfileId = profile.id;
    }

    const shouldUpdateRuleConfig =
      updates.status !== undefined ||
      updates.priority !== undefined ||
      updates.amount !== undefined ||
      updates.profitTakingPercentage !== undefined;

    const [, updated] = await this.prisma.$transaction([
      shouldUpdateRuleConfig
        ? this.prisma.betRuleConfig.update({
            where: { id: existing.betRuleConfigId },
            data: {
              status: updates.status,
              priority: updates.priority,
              amount: updates.amount,
              profitTakingPercentage: updates.profitTakingPercentage,
            },
          })
        : this.prisma.betRuleConfig.findUniqueOrThrow({
            where: { id: existing.betRuleConfigId },
          }),
      this.prisma.sportsBet.update({
        where: { id },
        data: {
          marketProfileId: nextMarketProfileId,
          keyword: updates.keyword,
          category: updates.category,
        },
        include: { marketProfile: true, betRuleConfig: true },
      }),
    ]);
    return {
      id: updated.id,
      marketVariant: updated.marketProfile.marketVariant as MarketVariant,
      configKey: updated.marketProfile.configKey,
      category: updated.category,
      keyword: updated.keyword,
      priority: updated.betRuleConfig.priority,
      amount: updated.betRuleConfig.amount,
      profitTakingPercentage: updated.betRuleConfig.profitTakingPercentage,
      status: updated.betRuleConfig.status as 'ACTIVE' | 'INACTIVE',
    };
  }

  async getAllSlugMatchRules(): Promise<SlugMatchRuleRecord[]> {
    const rows = await this.prisma.cryptoBet.findMany({
      where: { enabled: true },
      include: { marketProfile: true, betRuleConfig: true },
      orderBy: [{ betRuleConfig: { priority: 'asc' } }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      marketVariant: row.marketProfile.marketVariant as MarketVariant,
      configKey: row.marketProfile.configKey,
      matchType: this.fromDbSlugMatchType(String(row.matchType)),
      pattern: row.pattern,
      amount: row.betRuleConfig.amount,
      profitTakingPercentage: row.betRuleConfig.profitTakingPercentage,
      status: row.betRuleConfig.status as 'ACTIVE' | 'INACTIVE',
      enabled: row.enabled,
      priority: row.betRuleConfig.priority,
    }));
  }

  async saveSlugMatchRule(params: {
    marketVariant: MarketVariant;
    configKey: string;
    matchType: SlugMatchType;
    pattern: string;
    enabled: boolean;
    priority: number;
    status?: 'ACTIVE' | 'INACTIVE';
    amount: number;
    profitTakingPercentage?: number;
  }): Promise<SlugMatchRuleRecord> {
    const {
      marketVariant,
      configKey,
      matchType,
      pattern,
      enabled,
      priority,
      status,
      amount,
      profitTakingPercentage,
    } = params;
    const profile = await this.ensureMarketProfile(marketVariant, configKey);
    const dbMatchType = this.toDbSlugMatchType(matchType);
    const existing = await this.prisma.cryptoBet.findFirst({
      where: {
        marketProfileId: profile.id,
        matchType: dbMatchType,
        pattern,
      },
    });
    if (existing) {
      throw new ConflictException(
        `Slug match rule already exists for marketVariant: ${marketVariant}, configKey: ${configKey}, matchType: ${matchType}, pattern: ${pattern}`,
      );
    }
    const inserted = await this.prisma.cryptoBet.create({
      data: {
        marketProfile: {
          connect: { id: profile.id },
        },
        matchType: dbMatchType,
        pattern,
        enabled,
        betRuleConfig: {
          create: {
            status: status ?? 'ACTIVE',
            priority,
            amount,
            profitTakingPercentage,
          },
        },
      },
      include: { marketProfile: true, betRuleConfig: true },
    });
    return {
      id: inserted.id,
      marketVariant: inserted.marketProfile.marketVariant as MarketVariant,
      configKey: inserted.marketProfile.configKey,
      matchType: this.fromDbSlugMatchType(String(inserted.matchType)),
      pattern: inserted.pattern,
      amount: inserted.betRuleConfig.amount,
      profitTakingPercentage: inserted.betRuleConfig.profitTakingPercentage,
      status: inserted.betRuleConfig.status as 'ACTIVE' | 'INACTIVE',
      enabled: inserted.enabled,
      priority: inserted.betRuleConfig.priority,
    };
  }

  async updateSlugMatchRule(
    id: number,
    updates: {
      marketVariant?: MarketVariant;
      configKey?: string;
      matchType?: SlugMatchType;
      pattern?: string;
      status?: 'ACTIVE' | 'INACTIVE';
      enabled?: boolean;
      priority?: number;
      amount?: number;
      profitTakingPercentage?: number;
    },
  ): Promise<SlugMatchRuleRecord> {
    const existing = await this.prisma.cryptoBet.findUnique({
      where: { id },
      include: { marketProfile: true },
    });
    if (!existing) {
      throw new NotFoundException(`Slug match rule not found for id: ${id}`);
    }
    let nextMarketProfileId = existing.marketProfileId;
    const nextMarketVariant =
      updates.marketVariant ?? existing.marketProfile.marketVariant;
    const nextConfigKey = updates.configKey ?? existing.marketProfile.configKey;
    if (
      nextMarketVariant !== existing.marketProfile.marketVariant ||
      nextConfigKey !== existing.marketProfile.configKey
    ) {
      const profile = await this.ensureMarketProfile(
        nextMarketVariant as MarketVariant,
        nextConfigKey,
      );
      nextMarketProfileId = profile.id;
    }
    const shouldUpdateRuleConfig =
      updates.status !== undefined ||
      updates.priority !== undefined ||
      updates.amount !== undefined ||
      updates.profitTakingPercentage !== undefined;

    const [, updated] = await this.prisma.$transaction([
      shouldUpdateRuleConfig
        ? this.prisma.betRuleConfig.update({
            where: { id: existing.betRuleConfigId },
            data: {
              status: updates.status,
              priority: updates.priority,
              amount: updates.amount,
              profitTakingPercentage: updates.profitTakingPercentage,
            },
          })
        : this.prisma.betRuleConfig.findUniqueOrThrow({
            where: { id: existing.betRuleConfigId },
          }),
      this.prisma.cryptoBet.update({
        where: { id },
        data: {
          marketProfileId: nextMarketProfileId,
          matchType:
            updates.matchType !== undefined
              ? this.toDbSlugMatchType(updates.matchType)
              : undefined,
          pattern: updates.pattern,
          enabled: updates.enabled,
        },
        include: { marketProfile: true, betRuleConfig: true },
      }),
    ]);
    return {
      id: updated.id,
      marketVariant: updated.marketProfile.marketVariant as MarketVariant,
      configKey: updated.marketProfile.configKey,
      matchType: this.fromDbSlugMatchType(String(updated.matchType)),
      pattern: updated.pattern,
      amount: updated.betRuleConfig.amount,
      profitTakingPercentage: updated.betRuleConfig.profitTakingPercentage,
      status: updated.betRuleConfig.status as 'ACTIVE' | 'INACTIVE',
      enabled: updated.enabled,
      priority: updated.betRuleConfig.priority,
    };
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
    const { marketSlug, outcomeOnChainId } = this.parseManagedTradeSlug(slug);
    return this.prisma.trade.create({
      data: {
        marketId,
        slug,
        marketSlug,
        outcomeOnChainId,
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
    entry: number,
    tradeType?: BuyTradeType,
  ): Promise<BuyPositionConfigRecord> {
    const profile = await this.ensureMarketProfile(
      marketVariant,
      slugWithSuffix,
    );
    const existing = await this.prisma.buyPositionConfig.findUnique({
      where: { marketProfileId: profile.id },
    });
    if (existing) {
      throw new ConflictException(
        `Buy position config already exists for marketVariant: ${marketVariant}, slugWithSuffix: ${slugWithSuffix}`,
      );
    }
    const normalizedTradeType = normalizeBuyTradeType(tradeType, {
      defaultType:
        marketVariant === MarketVariant.SPORTS_TEAM_MATCH ? 'na' : 'avg-price',
    });
    const created = await this.prisma.buyPositionConfig.create({
      data: {
        marketProfileId: profile.id,
        entry,
        tradeType: this.toDbBuyTradeType(normalizedTradeType),
      },
    });
    return {
      id: created.id,
      marketVariant,
      slugWithSuffix,
      entry: created.entry,
      tradeType: normalizedTradeType,
    };
  }

  async updateBuyPositionConfig(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
    updates: {
      entry?: number;
      tradeType?: BuyTradeType;
    },
  ): Promise<BuyPositionConfigRecord> {
    const profile = await this.getMarketProfileByVariantAndKey(
      marketVariant,
      slugWithSuffix,
    );
    if (!profile) {
      throw new NotFoundException(
        `Buy position config not found for marketVariant: ${marketVariant}, slugWithSuffix: ${slugWithSuffix}`,
      );
    }
    const buyConfig = await this.prisma.buyPositionConfig.findUnique({
      where: { marketProfileId: profile.id },
    });
    if (!buyConfig) {
      throw new NotFoundException(
        `Buy position config not found for marketVariant: ${marketVariant}, slugWithSuffix: ${slugWithSuffix}`,
      );
    }
    const updated = await this.prisma.buyPositionConfig.update({
      where: { id: buyConfig.id },
      data: {
        entry: updates.entry,
        ...(updates.tradeType !== undefined
          ? {
              tradeType: this.toDbBuyTradeType(
                normalizeBuyTradeType(updates.tradeType),
              ),
            }
          : {}),
      },
    });
    return {
      id: updated.id,
      marketVariant,
      slugWithSuffix,
      entry: updated.entry,
      tradeType: this.fromDbBuyTradeType(String(updated.tradeType)),
    };
  }

  async saveSellPositionConfig(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
    stopLossPercentage: number,
    amountPercentage: number,
  ): Promise<SellPositionConfigRecord> {
    const profile = await this.ensureMarketProfile(
      marketVariant,
      slugWithSuffix,
    );
    const existing = await this.prisma.sellPositionConfig.findUnique({
      where: { marketProfileId: profile.id },
    });
    if (existing) {
      throw new ConflictException(
        `Sell position config already exists for marketVariant: ${marketVariant}, slugWithSuffix: ${slugWithSuffix}`,
      );
    }
    const created = await this.prisma.sellPositionConfig.create({
      data: {
        marketProfileId: profile.id,
        stopLossPercentage,
        amountPercentage,
      },
    });
    return {
      id: created.id,
      marketVariant,
      slugWithSuffix,
      stopLossPercentage: created.stopLossPercentage,
      amountPercentage: created.amountPercentage,
    };
  }

  async updateSellPositionConfig(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
    updates: {
      stopLossPercentage?: number;
      amountPercentage?: number;
    },
  ): Promise<SellPositionConfigRecord> {
    const profile = await this.getMarketProfileByVariantAndKey(
      marketVariant,
      slugWithSuffix,
    );
    if (!profile) {
      throw new NotFoundException(
        `Sell position config not found for marketVariant: ${marketVariant}, slugWithSuffix: ${slugWithSuffix}`,
      );
    }
    const sellConfig = await this.prisma.sellPositionConfig.findUnique({
      where: { marketProfileId: profile.id },
    });
    if (!sellConfig) {
      throw new NotFoundException(
        `Sell position config not found for marketVariant: ${marketVariant}, slugWithSuffix: ${slugWithSuffix}`,
      );
    }
    const updated = await this.prisma.sellPositionConfig.update({
      where: { id: sellConfig.id },
      data: updates,
    });
    return {
      id: updated.id,
      marketVariant,
      slugWithSuffix,
      stopLossPercentage: updated.stopLossPercentage,
      amountPercentage: updated.amountPercentage,
    };
  }
}
