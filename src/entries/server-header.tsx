import { render } from "preact";
import { AppHeader } from "@/components/ui/AppHeader";
import { applyTheme } from "@/lib/theme";

const container = document.getElementById("server-header");
if (container) {
  render(<AppHeader homeHref="/" showBack={container.dataset.back === "true"}
    backHref={container.dataset.backHref || "/"} backLabel={false}
    sectionTitle={container.dataset.section || undefined} onThemeSelect={applyTheme} />, container);
}
