/** Intents where matching does not depend on location (friends / chat only). */
export function softIntentsOnly(intents: string[]): boolean {
  return intents.length > 0 && intents.every((id) => id === "friends" || id === "chat");
}
