import { render } from "preact";
import { ProfileScreen } from "./ProfileScreen";
import { ConsentScreen } from "./ConsentScreen";
import { PlusScreen } from "./PlusScreen";
import type { ProfileHostBridge } from "./types";

export function mountProfile(container: HTMLElement, host: ProfileHostBridge): () => void {
  render(<ProfileScreen host={host} />, container);
  return () => render(null, container);
}

export function mountConsent(container: HTMLElement, host: ProfileHostBridge): () => void {
  render(<ConsentScreen host={host} />, container);
  return () => render(null, container);
}

export function mountPlus(container: HTMLElement, host: ProfileHostBridge): () => void {
  render(<PlusScreen host={host} />, container);
  return () => render(null, container);
}
