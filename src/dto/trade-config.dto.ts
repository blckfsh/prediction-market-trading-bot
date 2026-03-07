import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { API_MARKET_VARIANTS } from 'src/predict/predict.market-variant';
import type { ApiMarketVariant } from 'src/predict/predict.market-variant';
import { BUY_TRADE_TYPES } from 'src/predict/buy-trade-type';
import type { BuyTradeType } from 'src/predict/buy-trade-type';

class CreateBuyPositionConfigBody {
  @IsIn(API_MARKET_VARIANTS)
  marketVariant: ApiMarketVariant;

  @IsString()
  slugWithSuffix: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsInt()
  @Min(1)
  entry: number;

  @IsOptional()
  @IsIn(BUY_TRADE_TYPES)
  tradeType?: BuyTradeType;
}

class UpdateBuyPositionConfigBody {
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  entry?: number;

  @IsOptional()
  @IsIn(BUY_TRADE_TYPES)
  tradeType?: BuyTradeType;
}

class CreateSellPositionConfigBody {
  @IsIn(API_MARKET_VARIANTS)
  marketVariant: ApiMarketVariant;

  @IsString()
  slugWithSuffix: string;

  @IsInt()
  @Min(1)
  stopLossPercentage: number;

  @IsInt()
  @Min(1)
  amountPercentage: number;
}

class UpdateSellPositionConfigBody {
  @IsOptional()
  @IsInt()
  @Min(1)
  stopLossPercentage?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  amountPercentage?: number;
}

export {
  CreateBuyPositionConfigBody,
  UpdateBuyPositionConfigBody,
  CreateSellPositionConfigBody,
  UpdateSellPositionConfigBody,
};
