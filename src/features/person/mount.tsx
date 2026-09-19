import { render } from "preact";
import { PersonScreen } from "./PersonScreen";
import type { PersonHostBridge } from "./types";

export function mountPerson(container: HTMLElement, host: PersonHostBridge): () => void {
  render(<PersonScreen host={host} />, container);
  return () => render(null, container);
}
