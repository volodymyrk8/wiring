import { render } from "preact";
import { DeckScreen } from "./DeckScreen";
import type { DeckHostBridge } from "./types";

export function mountDeck(container: HTMLElement, host: DeckHostBridge): () => void {
  render(<DeckScreen host={host} />, container);
  return () => render(null, container);
}
