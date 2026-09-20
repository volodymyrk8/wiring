import { render } from "preact";
import { SupportScreen } from "./SupportScreen";
import type { SupportHostBridge } from "./types";

export function mountSupport(container: HTMLElement, host: SupportHostBridge): () => void {
  render(<SupportScreen host={host} />, container);
  return () => render(null, container);
}
