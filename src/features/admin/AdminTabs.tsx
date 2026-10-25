import { tr } from "@/lib/i18n";
import { render } from "preact";
import { useLayoutEffect, useState } from "preact/hooks";
import styles from "./AdminTabs.module.css";

type Tab = { id: string; label: string; count?: string; countTitle?: string };

function AdminTabs({ tabs, panels }: { tabs: Tab[]; panels: HTMLElement[] }) {
  const tabFromHash = () => {
    const anchor = document.getElementById(window.location.hash.slice(1));
    const panel = anchor?.closest<HTMLElement>("[data-admin-panel]");
    return panel && panels.includes(panel) ? panel.id : tabs[0].id;
  };
  const [active, setActive] = useState(tabFromHash);

  useLayoutEffect(() => {
    const sync = () => setActive(tabFromHash());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  useLayoutEffect(() => {
    panels.forEach((panel) => {
      panel.hidden = panel.id !== active;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", `admin-tab-${panel.id}`);
      panel.tabIndex = 0;
    });
    // Old moderation links point at a heading inside the panel.
    const anchor = document.getElementById(window.location.hash.slice(1));
    if (anchor && anchor.id !== active && anchor.closest("[data-admin-panel]")?.id === active) {
      anchor.scrollIntoView({ block: "start" });
    }
  }, [active]);

  function select(id: string) {
    if (window.location.hash !== `#${id}`) window.history.pushState(null, "", `#${id}`);
    setActive(id);
  }

  return <div class={styles.tabs} role="tablist" aria-label={tr("Разделы админки")}>
    {tabs.map((tab, index) => <a key={tab.id} id={`admin-tab-${tab.id}`} href={`#${tab.id}`}
      role="tab" aria-selected={active === tab.id} aria-controls={tab.id}
      tabIndex={active === tab.id ? 0 : -1} class={styles.tab}
      onClick={(event) => {
        if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        select(tab.id);
      }}
      onKeyDown={(event) => {
        const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!offset && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + offset + tabs.length) % tabs.length;
        select(tabs[next].id);
        document.getElementById(`admin-tab-${tabs[next].id}`)?.focus();
      }}>
      {tab.label}{tab.count !== undefined && <span class={styles.count} title={tab.countTitle}>{tab.count}</span>}
    </a>)}
  </div>;
}

export function mountAdminTabs() {
  const host = document.querySelector<HTMLElement>("[data-admin-tabs]");
  const root = host?.closest<HTMLElement>("main");
  if (!host || !root) return;
  const panels = Array.from(root.querySelectorAll<HTMLElement>("[data-admin-panel]"));
  const tabs = Array.from(host.querySelectorAll<HTMLAnchorElement>("[data-tab]")).map((link) => ({
    id: link.dataset.tab!,
    label: link.firstChild?.textContent?.trim() || "",
    count: link.querySelector("[data-count]")?.textContent?.trim(),
    countTitle: link.querySelector("[data-count]")?.getAttribute("title") || undefined,
  }));
  if (!tabs.length || !panels.length) return;
  root.classList.add(styles.root);
  host.classList.add(styles.navigation);
  root.querySelectorAll<HTMLTableElement>(".admin-table").forEach((table) => {
    const wrapper = document.createElement("div");
    wrapper.className = styles.tableScroll;
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", table.previousElementSibling?.textContent?.trim() || tr("Таблица админки"));
    table.before(wrapper);
    wrapper.append(table);
  });
  host.replaceChildren();
  render(<AdminTabs tabs={tabs} panels={panels} />, host);
}
