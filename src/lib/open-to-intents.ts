/** «открыт(а) к: …» on profile cards — agrees with the person's gender. */
export function openToIntentsLine(gender: string | undefined, labels: string[]): string {
  if (!labels.length) return "";
  const list = labels.join(", ");
  if (gender === "man") return `открыт к: ${list}`;
  if (gender === "woman") return `открыта к: ${list}`;
  return `открыто к: ${list}`;
}
