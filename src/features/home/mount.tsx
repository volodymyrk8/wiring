import { render } from "preact";
import { HomeScreen } from "@/features/home/HomeScreen";
import type { HomeHostBridge } from "@/features/home/types";

export function mountHome(container: HTMLElement, host: HomeHostBridge): () => void {
  render(<HomeScreen host={host} />, container);
  return () => render(null, container);
}
