import { render } from "preact";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { AppHeader } from "@/components/ui/AppHeader";
import { applyTheme } from "@/lib/theme";
import type { AuthHostBridge } from "@/features/auth/types";

export function mountAuth(container: HTMLElement, host: AuthHostBridge): () => void {
  render(<>
    <AppHeader logoPosition="center" showBack backLabel={false} backHref={host.hrefFor("home")}
      homeHref={host.hrefFor("home")} onThemeSelect={applyTheme} />
    <div class="auth-shell"><section class="panel auth-panel"><AuthScreen host={host} /></section></div>
  </>, container);
  return () => render(null, container);
}
