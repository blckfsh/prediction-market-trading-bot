import {
  IsBoolean,
  IsIn,
  IsInt,
  Max,
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
const BET_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
type BetStatus = (typeof BET_STATUSES)[number];

class CreateBuyPositionConfigBody {
  @IsIn(API_MARKET_VARIANTS)
  marketVariant: ApiMarketVariant;

  @IsString()
  slugWithSuffix: string;

  @IsInt()
  @Min(0)
  entry: number;

  @IsOptional()
  @IsIn(BUY_TRADE_TYPES)
  tradeType?: BuyTradeType;
}

class UpdateBuyPositionConfigBody {
  @IsOptional()
  @IsInt()
  @Min(0)
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
  @Max(100)
  stopLossPercentage: number;

  @IsInt()
  @Min(1)
  @Max(100)
  amountPercentage: number;
}

class UpdateSellPositionConfigBody {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  stopLossPercentage?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  amountPercentage?: number;
}

class CreateSlugMatchRuleBody {
  @IsIn(API_MARKET_VARIANTS)
  marketVariant: ApiMarketVariant;

  @IsString()
  configKey: string;

  @IsIn(SLUG_MATCH_TYPES)
  matchType: SlugMatchType;

  @IsString()
  pattern: string;

  @IsOptional()
  @IsIn(BET_STATUSES)
  status?: BetStatus;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsInt()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  profitTakingPercentage?: number;
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
  @IsIn(BET_STATUSES)
  status?: BetStatus;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  profitTakingPercentage?: number;
}

class CreateCryptoBetBody {
  @IsIn(API_MARKET_VARIANTS)
  marketVariant: ApiMarketVariant;

  @IsString()
  configKey: string;

  @IsIn(SLUG_MATCH_TYPES)
  matchType: SlugMatchType;

  @IsString()
  pattern: string;

  @IsOptional()
  @IsIn(BET_STATUSES)
  status?: BetStatus;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsInt()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  profitTakingPercentage?: number;
}

class UpdateCryptoBetBody {
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
  @IsIn(BET_STATUSES)
  status?: BetStatus;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  profitTakingPercentage?: number;
}

class CreateMarketProfileBody {
  @IsIn(API_MARKET_VARIANTS)
  marketVariant: ApiMarketVariant;

  @IsString()
  configKey: string;
}

class CreateSportsBetBody {
  @IsIn(API_MARKET_VARIANTS)
  marketVariant: ApiMarketVariant;

  @IsString()
  configKey: string;

  @IsString()
  category: string;

  @IsString()
  keyword: string;

  @IsOptional()
  @IsIn(BET_STATUSES)
  status?: BetStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsInt()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  profitTakingPercentage?: number;
}

class UpdateSportsBetBody {
  @IsOptional()
  @IsIn(API_MARKET_VARIANTS)
  marketVariant?: ApiMarketVariant;

  @IsOptional()
  @IsString()
  configKey?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(BET_STATUSES)
  status?: BetStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  profitTakingPercentage?: number;
}

export {
  CreateBuyPositionConfigBody,
  UpdateBuyPositionConfigBody,
  CreateSellPositionConfigBody,
  UpdateSellPositionConfigBody,
  CreateSlugMatchRuleBody,
  UpdateSlugMatchRuleBody,
  CreateCryptoBetBody,
  UpdateCryptoBetBody,
  CreateMarketProfileBody,
  CreateSportsBetBody,
  UpdateSportsBetBody,
  SLUG_MATCH_TYPES,
};
