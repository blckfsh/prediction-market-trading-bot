import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ZeroHash } from 'ethers';
import { PrismaService } from 'src/prisma/prisma.service';
import { SaveMarketTradeInput } from 'src/predict/types/market.types';
import { MarketVariant, TradeOptions } from 'lib/zenstack/models';
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

  async getTradeConfigByMarketVariant(marketVariant: MarketVariant) {
    return this.prisma.tradeConfig.findFirst({
      where: { marketVariant },
    });
  }

  async getAllTradeConfigs() {
    return this.prisma.tradeConfig.findMany();
  }

  async saveMarketTrade({
    marketId,
    slug,
    amount,
    transactionHash,
    timestamp,
    status,
  }: SaveMarketTradeInput) {
    return this.prisma.trade.create({
      data: {
        marketId,
        slug,
        amount,
        transactionHash: transactionHash ?? ZeroHash.toString(),
        timestamp,
        status,
      },
    });
  }

  async updateMarketTradeStatus(
    tradeId: number,
    status: TradeStatus,
    transactionHash?: string,
  ) {
    return this.prisma.trade.update({
      where: { id: tradeId },
      data: {
        status,
        transactionHash: transactionHash ?? ZeroHash.toString(),
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

  async saveTradeConfig(
    marketVariant: MarketVariant,
    options: TradeOptions,
    amount: number,
  ) {
    const tradeConfig = await this.getTradeConfigByMarketVariant(marketVariant);
    if (tradeConfig) {
      throw new ConflictException(
        `Trade config already exists for marketVariant: ${marketVariant}`,
      );
    }
    return this.prisma.tradeConfig.create({
      data: {
        marketVariant,
        options,
        amount,
      },
    });
  }

  async updateTradeConfigAmount(marketVariant: MarketVariant, amount: number) {
    const tradeConfig = await this.getTradeConfigByMarketVariant(marketVariant);
    if (!tradeConfig) {
      throw new NotFoundException(
        `Trade config not found for marketVariant: ${marketVariant}`,
      );
    }
    return this.prisma.tradeConfig.update({
      where: { id: tradeConfig.id },
      data: { amount },
    });
  }
}
