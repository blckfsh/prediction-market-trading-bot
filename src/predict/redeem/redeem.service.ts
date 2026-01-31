import { Injectable } from '@nestjs/common';
import { OrderBuilder } from '@predictdotfun/sdk';
import { RedeemPositionParams } from 'src/predict/types/market.types';

@Injectable()
export class RedeemService {
  async redeemStandardPosition({
    orderBuilder,
    conditionId,
    indexSet,
    isNegRisk,
    isYieldBearing,
  }: RedeemPositionParams & { orderBuilder: OrderBuilder }) {
    try {
      const result = await orderBuilder.redeemPositions({
        conditionId,
        indexSet,
        isNegRisk,
        isYieldBearing,
      });
      if (!result.success) {
        throw new Error(`Failed to redeem position: ${result.cause}`);
      }
      console.log('Redeem position successful', result.receipt);
      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to redeem position: ${error.message}`);
      }
      throw new Error('Failed to redeem position: Unknown error');
    }
  }

  async redeemNegRiskPosition({
    orderBuilder,
    conditionId,
    indexSet,
    isNegRisk,
    isYieldBearing,
    amount,
  }: RedeemPositionParams & { orderBuilder: OrderBuilder }) {
    try {
      const result = await orderBuilder.redeemPositions({
        conditionId,
        indexSet,
        amount,
        isNegRisk,
        isYieldBearing,
      });
      if (!result.success) {
        throw new Error(`Failed to redeem position: ${result.cause}`);
      }
      console.log('Redeem position successful', result.receipt);
      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to redeem position: ${error.message}`);
      }
      throw new Error('Failed to redeem position: Unknown error');
    }
  }
}
