import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { API_MARKET_VARIANTS } from 'src/predict/predict.market-variant';
import type { ApiMarketVariant } from 'src/predict/predict.market-variant';
import { BUY_TRADE_TYPES } from 'src/predict/buy-trade-type';
import type { BuyTradeType } from 'src/predict/buy-trade-type';

const SLUG_MATCH_TYPES = ['prefix', 'suffix', 'regex'] as const;
type SlugMatchType = (typeof SLUG_MATCH_TYPES)[number];

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

class CreateSlugMatchRuleBody {
  @IsOptional()
  @IsIn(API_MARKET_VARIANTS)
  marketVariant?: ApiMarketVariant;

  @IsString()
  configKey: string;

  @IsIn(SLUG_MATCH_TYPES)
  matchType: SlugMatchType;

  @IsString()
  pattern: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}

class UpdateSlugMatchRuleBody {
  @IsOptional()
  @IsIn(API_MARKET_VARIANTS)
  marketVariant?: ApiMarketVariant;

  @IsOptional()
  @IsString()
  configKey?: string;

  @IsOptional()
  @IsIn(SLUG_MATCH_TYPES)
  matchType?: SlugMatchType;

  @IsOptional()
  @IsString()
  pattern?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}

export {
  CreateBuyPositionConfigBody,
  UpdateBuyPositionConfigBody,
  CreateSellPositionConfigBody,
  UpdateSellPositionConfigBody,
  CreateSlugMatchRuleBody,
  UpdateSlugMatchRuleBody,
  SLUG_MATCH_TYPES,
};
