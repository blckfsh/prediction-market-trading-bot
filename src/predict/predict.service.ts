import { Injectable, Logger } from '@nestjs/common';
import { TradeConfig, WalletApproval } from 'generated/prisma/client';
import { MarketVariant, TradeOptions } from 'lib/zenstack/models';
import { PredictRepository } from './predict.repository';
import { REFERRAL_CODE } from 'src/lib/helpers/constants';
import { OrderBuilder } from '@predictdotfun/sdk';
import { SetApprovalsResult } from '@predictdotfun/sdk';

@Injectable()
export class PredictService {
  private readonly logger = new Logger(PredictService.name);

  constructor(private readonly predictRepository: PredictRepository) {}

  async getTradeConfigByMarketVariant(
    marketVariant: MarketVariant,
  ): Promise<TradeConfig | null> {
    return this.predictRepository.getTradeConfigByMarketVariant(marketVariant);
  }

  async createTradeConfig(
    marketVariant: MarketVariant,
    options: TradeOptions,
    amount: number,
  ): Promise<TradeConfig> {
    return this.predictRepository.saveTradeConfig(
      marketVariant,
      options,
      amount,
    );
  }

  async updateTradeConfigAmount(
    marketVariant: MarketVariant,
    amount: number,
  ): Promise<TradeConfig> {
    return this.predictRepository.updateTradeConfigAmount(
      marketVariant,
      amount,
    );
  }

  async setReferralCode(params: {
    baseUrl: string;
    apiKey: string;
    token: string;
    referralCode?: string;
  }): Promise<boolean> {
    const { baseUrl, apiKey, token, referralCode } = params;
    let result = false;
    try {
      const headers = new Headers();
      headers.append('x-api-key', apiKey);
      headers.append('Authorization', `Bearer ${token}`);

      const requestOptions = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          referralCode: referralCode ?? REFERRAL_CODE,
        }),
        redirect: 'follow',
      };

      const response = await fetch(
        `${baseUrl}/account/referral`,
        requestOptions as RequestInit,
      );
      if (!response.ok) {
        this.logger.warn(
          `Failed to set referral code: HTTP ${response.status} ${response.statusText}`,
        );
        return false;
      }
      result = (await response.json()) as boolean;
      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to set referral code: ${error.message}`);
      }
      throw new Error('Failed to set referral code: Unknown error');
    }
  }

  async setApprovals(params: {
    predictAccount: string;
    orderBuilder: OrderBuilder;
  }): Promise<SetApprovalsResult | void> {
    const { predictAccount, orderBuilder } = params;
    let result: SetApprovalsResult | null = null;

    try {
      const selectedWalletApproval =
        await this.predictRepository.getWalletApprovalByWalletAddress(
          predictAccount,
        );
      if (selectedWalletApproval) {
        this.logger.log(`Wallet approvals already set for ${predictAccount}.`);
        return;
      }

      // NOTE: You can also call `setApprovals` once per wallet.
      result = await orderBuilder.setApprovals();
      if (!result.success) throw new Error('Failed to set approvals.');

      const walletApproval = await this.saveWalletApprovals(predictAccount);
      if (!walletApproval) throw new Error('Failed to save wallet approvals.');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to set approvals: ${error.message}`);
      }
      throw new Error('Failed to set approvals: Unknown error');
    }

    return result;
  }

  private async saveWalletApprovals(
    predictAccount: string,
  ): Promise<WalletApproval | null> {
    let walletApproval: WalletApproval | null = null;
    try {
      walletApproval = await this.predictRepository.saveWalletApprovals(
        predictAccount,
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to save wallet approvals: ${error.message}`);
      }
      throw new Error('Failed to save wallet approvals: Unknown error');
    } finally {
      this.logger.log(
        `Wallet approvals saved, id: ${walletApproval?.id ?? 'N/A'}`,
      );
    }

    return walletApproval;
  }
}
