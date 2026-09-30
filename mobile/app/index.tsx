import { Redirect } from "expo-router";

// Gate in _layout.tsx sends signed-out users to /login.
export default function Index() {
  return <Redirect href="/(tabs)/feed" />;
}
