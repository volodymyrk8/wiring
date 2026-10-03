import { render } from "preact";
import { DeckScreen } from "./DeckScreen";
import { RecommendationsScreen } from "@/features/recommendations/RecommendationsScreen";
import type { DeckHostBridge } from "./types";

export function mountDeck(container: HTMLElement, host: DeckHostBridge): () => void {
  render(<DeckScreen host={host} />, container);
  return () => render(null, container);
}


export function mountRecommendations(container: HTMLElement, host: DeckHostBridge): () => void {
  render(<RecommendationsScreen host={host} />, container);
  return () => render(null, container);
}
