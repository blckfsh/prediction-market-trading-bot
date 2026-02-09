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

@Injectable()
export class PredictRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getTradeByMarketId(marketId: number) {
    return this.prisma.trade.findFirst({
      where: { marketId },
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

  async saveMarketTrade({
    marketId,
    slug,
    amount,
    buyOrderHash,
    timestamp,
    status,
  }: SaveMarketTradeInput) {
    return this.prisma.trade.create({
      data: {
        marketId,
        slug,
        amount,
        buyOrderHash: buyOrderHash ?? ZeroHash.toString(),
        timestamp,
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
        timestamp: new Date(),
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
      },
    });
  }

  async updateBuyPositionConfig(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
    updates: {
      amount?: number;
      entry?: number;
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
      data: updates,
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
