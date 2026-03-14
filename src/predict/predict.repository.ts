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

@Injectable()
export class PredictRepository {
  constructor(private readonly prisma: PrismaService) {}

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
