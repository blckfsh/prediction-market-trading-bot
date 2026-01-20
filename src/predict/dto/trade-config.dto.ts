import { IsEnum, IsInt, Min } from 'class-validator';
import { MarketVariant, TradeOptions } from 'lib/zenstack/models';

class CreateTradeConfigBody {
  @IsEnum(MarketVariant)
  marketVariant: MarketVariant;

  @IsEnum(TradeOptions)
  options: TradeOptions;

  @IsInt()
  @Min(1)
  amount: number;
}

class UpdateTradeConfigAmountBody {
  @IsInt()
  @Min(1)
  amount: number;
}

export { CreateTradeConfigBody, UpdateTradeConfigAmountBody };
