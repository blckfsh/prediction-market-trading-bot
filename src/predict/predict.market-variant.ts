import { BadRequestException } from '@nestjs/common';
import { MarketVariant } from 'lib/zenstack/models';

const API_MARKET_VARIANTS = [
  'DEFAULT',
  'SPORTS_MATCH',
  'CRYPTO_UP_DOWN',
] as const;

type ApiMarketVariant = (typeof API_MARKET_VARIANTS)[number];

function normalizeMarketVariant(value: string): MarketVariant {
  if (Object.values(MarketVariant).includes(value as MarketVariant)) {
    return value as MarketVariant;
  }
  throw new BadRequestException(
    `Unsupported marketVariant: ${value}. Supported variants: ${API_MARKET_VARIANTS.join(', ')}`,
  );
}

export { API_MARKET_VARIANTS, normalizeMarketVariant };
export type { ApiMarketVariant };
