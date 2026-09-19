import { render } from "preact";
import { DeleteAccountScreen, InviteScreen, OnboardScreen } from "./AccountScreen";
import type { AccountHostBridge } from "./types";

export function mountInvite(container: HTMLElement, host: AccountHostBridge): () => void {
  render(<InviteScreen host={host} />, container);
  return () => render(null, container);
}

export function mountDeleteAccount(container: HTMLElement, host: AccountHostBridge): () => void {
  render(<DeleteAccountScreen host={host} />, container);
  return () => render(null, container);
}

export function mountOnboard(container: HTMLElement, host: AccountHostBridge): () => void {
  render(<OnboardScreen host={host} />, container);
  return () => render(null, container);
}
