import { render } from "preact";
import { HomeScreen } from "./HomeScreen";
import type { HomeHostBridge } from "./types";

export function mountHome(container: HTMLElement, host: HomeHostBridge): () => void {
  render(<HomeScreen host={host} />, container);
  return () => render(null, container);
}
