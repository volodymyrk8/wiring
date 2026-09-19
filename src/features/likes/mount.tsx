import { render } from "preact";
import { LikesScreen } from "./LikesScreen";
import type { LikesHostBridge } from "./types";

export function mountLikes(container: HTMLElement, host: LikesHostBridge): () => void {
  render(<LikesScreen host={host} />, container);
  return () => render(null, container);
}
