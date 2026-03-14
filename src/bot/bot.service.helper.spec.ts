import { filterAndSortSupportedCategories } from './bot.service.helper';
import { Category, MarketVariant } from 'src/types/market.types';

describe('filterAndSortSupportedCategories', () => {
  function createCategory(
    slug: string,
    marketVariant: MarketVariant,
    startsAt: string,
  ): Category {
    return {
      id: Number.parseInt(slug.replace(/\D/g, ''), 10) || 1,
      slug,
      title: slug,
      description: '',
      imageUrl: '',
      isNegRisk: false,
      isYieldBearing: false,
      marketVariant,
      createdAt: startsAt,
      endsAt: null,
      markets: [],
      startsAt,
      status: 'OPEN' as any,
      tags: [],
    };
  }

  it('keeps only supported market variants', () => {
    const categories = [
      createCategory(
        'default-market',
        MarketVariant.DEFAULT,
        '2026-03-10T08:00:00.000Z',
      ),
      createCategory(
        'sports-market',
        MarketVariant.SPORTS_TEAM_MATCH,
        '2026-03-10T09:00:00.000Z',
      ),
      createCategory(
        'crypto-market',
        MarketVariant.CRYPTO_UP_DOWN,
        '2026-03-10T10:00:00.000Z',
      ),
    ];

    expect(filterAndSortSupportedCategories(categories).map(({ slug }) => slug)).toEqual([
      'crypto-market',
      'sports-market',
    ]);
  });

  it('sorts supported categories by startsAt descending', () => {
    const categories = [
      createCategory(
        'older-crypto',
        MarketVariant.CRYPTO_UP_DOWN,
        '2026-03-10T08:00:00.000Z',
      ),
      createCategory(
        'newer-sports',
        MarketVariant.SPORTS_TEAM_MATCH,
        '2026-03-10T11:00:00.000Z',
      ),
    ];

    expect(filterAndSortSupportedCategories(categories).map(({ slug }) => slug)).toEqual([
      'newer-sports',
      'older-crypto',
    ]);
  });
});
