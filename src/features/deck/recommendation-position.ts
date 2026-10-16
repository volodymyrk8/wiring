import type { DeckCard } from "./types";

/** Navigation anchor only: always revalidate candidates with the server on return. */
export type RecommendationPosition = { cardId: number | null; index: number };

export function recommendationIndex(cards: DeckCard[], position?: RecommendationPosition | null): number {
  if (!position) return 0;
  if (position.cardId === null) return cards.length;
  const index = cards.findIndex((card) => card.id === position.cardId);
  return index >= 0 ? index : Math.min(position.index, Math.max(0, cards.length - 1));
}
