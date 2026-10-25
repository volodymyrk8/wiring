import { tr } from "@/lib/i18n";
/** «открыт(а) к: …» on profile cards — agrees with the person's gender. */
export function openToIntentsLine(gender: string | undefined, labels: string[]): string {
  if (!labels.length) return "";
  const list = labels.join(", ");
  if (gender === "man") return tr("открыт к: {0}", list);
  if (gender === "woman") return tr("открыта к: {0}", list);
  return tr("открыто к: {0}", list);
}
