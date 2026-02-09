import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { MarketVariant } from 'lib/zenstack/models';

class CreateBuyPositionConfigBody {
  @IsEnum(MarketVariant)
  marketVariant: MarketVariant;

  @IsString()
  slugWithSuffix: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsInt()
  @Min(1)
  entry: number;
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
}

class CreateSellPositionConfigBody {
  @IsEnum(MarketVariant)
  marketVariant: MarketVariant;

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
