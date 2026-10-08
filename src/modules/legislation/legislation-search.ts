import type {
  LegislationCategory,
  LegislationItem
} from "./legislation-data";

export interface LegislationSearchResult {
  readonly item: LegislationItem;
  readonly category: LegislationCategory;
}

export function searchLegislation(
  categories: readonly LegislationCategory[],
  query: string
): readonly LegislationSearchResult[] {
  const q = query.trim().toLocaleLowerCase("pt-PT");
  if (!q) return [];

  const results: LegislationSearchResult[] = [];

  for (const category of categories) {
    const categoryText =
      category.title + " " + category.subtitle;

    for (const item of category.items) {
      const text =
        categoryText +
        " " +
        item.title +
        " " +
        item.code +
        " " +
        item.fine +
        " " +
        item.description;

      if (text.toLocaleLowerCase("pt-PT").includes(q)) {
        results.push({ item, category });
      }
    }
  }

  return results;
}
