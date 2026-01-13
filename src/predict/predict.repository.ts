import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SaveMarketTradeInput } from './types/market.types';
import { ZeroHash } from 'ethers';

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

  async saveWalletApprovals(walletAddress: string) {
    return this.prisma.walletApproval.create({
      data: {
        walletAddress,
        timestamp: new Date(),
      },
    });
  }
}
