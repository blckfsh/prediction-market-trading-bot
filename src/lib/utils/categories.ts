import { Category, MarketVariant } from 'src/predict/types/market.types';

export function filterAndSortCryptoUpDownCategories(
  categories: Category[],
): Category[] {
  return categories
    .filter(
      (category) => category.marketVariant === MarketVariant.CRYPTO_UP_DOWN,
    )
    .sort((a, b) => {
      const dateA = new Date(a.startsAt).getTime();
      const dateB = new Date(b.startsAt).getTime();
      return dateB - dateA; // Descending order (newest first)
    });
}
