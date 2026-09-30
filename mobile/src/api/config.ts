import Constants from "expo-constants";

// Override with EXPO_PUBLIC_API_URL (e.g. http://127.0.0.1:5070 for the iOS simulator,
// http://10.0.2.2:5070 for the Android emulator).
export const API_URL: string = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ||
  "https://wiring.date"
).replace(/\/+$/, "");
