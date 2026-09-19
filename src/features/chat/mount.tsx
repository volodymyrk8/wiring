import { render } from "preact";
import { ChatScreen } from "./ChatScreen";
import type { ChatHostBridge } from "./types";

export function mountChat(container: HTMLElement, host: ChatHostBridge): () => void {
  render(<ChatScreen host={host} />, container);
  return () => render(null, container);
}
