import { Injectable, Logger } from '@nestjs/common';
import {
  BuyPositionConfig,
  SellPositionConfig,
  WalletApproval,
} from 'generated/prisma/client';
import { MarketVariant } from 'lib/zenstack/models';
import { PredictRepository } from './predict.repository';
import type { SlugMatchRuleRecord } from './predict.repository';
import { REFERRAL_CODE } from 'src/common/helpers/constants';
import { OrderBuilder } from '@predictdotfun/sdk';
import { SetApprovalsResult } from '@predictdotfun/sdk';
import type { BuyTradeType } from 'src/predict/buy-trade-type';

@Injectable()
export class PredictService {
  private readonly logger = new Logger(PredictService.name);

  constructor(private readonly predictRepository: PredictRepository) {}

  async getBuyPositionConfigByMarketVariant(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
  ): Promise<BuyPositionConfig | null> {
    return this.predictRepository.getBuyPositionConfigByMarketVariant(
      marketVariant,
      slugWithSuffix,
    );
  }

  async createBuyPositionConfig(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
    amount: number,
    entry: number,
    tradeType?: BuyTradeType,
  ): Promise<BuyPositionConfig> {
    return this.predictRepository.saveBuyPositionConfig(
      marketVariant,
      slugWithSuffix,
      amount,
      entry,
      tradeType,
    );
  }

  async updateBuyPositionConfig(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
    updates: {
      amount?: number;
      entry?: number;
      tradeType?: BuyTradeType;
    },
  ): Promise<BuyPositionConfig> {
    return this.predictRepository.updateBuyPositionConfig(
      marketVariant,
      slugWithSuffix,
      updates,
    );
  }

  async getSellPositionConfigByMarketVariant(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
  ): Promise<SellPositionConfig | null> {
    return this.predictRepository.getSellPositionConfigByMarketVariant(
      marketVariant,
      slugWithSuffix,
    );
  }

  async createSellPositionConfig(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
    stopLossPercentage: number,
    amountPercentage: number,
  ): Promise<SellPositionConfig> {
    return this.predictRepository.saveSellPositionConfig(
      marketVariant,
      slugWithSuffix,
      stopLossPercentage,
      amountPercentage,
    );
  }

  async updateSellPositionConfig(
    marketVariant: MarketVariant,
    slugWithSuffix: string,
    updates: {
      stopLossPercentage?: number;
      amountPercentage?: number;
    },
  ): Promise<SellPositionConfig> {
    return this.predictRepository.updateSellPositionConfig(
      marketVariant,
      slugWithSuffix,
      updates,
    );
  }

  async getAllSlugMatchRules(): Promise<SlugMatchRuleRecord[]> {
    return this.predictRepository.getAllSlugMatchRules();
  }

  async createSlugMatchRule(params: {
    marketVariant: MarketVariant | null;
    configKey: string;
    matchType: 'prefix' | 'suffix' | 'regex';
    pattern: string;
    enabled?: boolean;
    priority?: number;
  }): Promise<SlugMatchRuleRecord> {
    return this.predictRepository.saveSlugMatchRule({
      marketVariant: params.marketVariant,
      configKey: params.configKey,
      matchType: params.matchType,
      pattern: params.pattern,
      enabled: params.enabled ?? true,
      priority: params.priority ?? 100,
    });
  }

  async updateSlugMatchRule(
    id: number,
    updates: {
      marketVariant?: MarketVariant | null;
      configKey?: string;
      matchType?: 'prefix' | 'suffix' | 'regex';
      pattern?: string;
      enabled?: boolean;
      priority?: number;
    },
  ): Promise<SlugMatchRuleRecord> {
    return this.predictRepository.updateSlugMatchRule(id, updates);
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
      headers.append('Content-Type', 'application/json');

      const requestOptions = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          referralCode: String(referralCode ?? REFERRAL_CODE),
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
