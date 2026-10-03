import { DeckScreen } from "@/features/deck/DeckScreen";
import type { DeckHostBridge } from "@/features/deck/types";

/** Share discovery cards, gestures and explicit actions; keep delivery separate. */
export function RecommendationsScreen({ host }: { host: DeckHostBridge }) {
  return <DeckScreen host={{ ...host, recommendations: true }} />;
}
