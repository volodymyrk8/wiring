import { render } from "preact";
import { AuthScreen } from "@/features/auth/AuthScreen";
import type { AuthHostBridge } from "@/features/auth/types";

export function mountAuth(container: HTMLElement, host: AuthHostBridge): () => void {
  render(<AuthScreen host={host} />, container);
  return () => render(null, container);
}
