export type HomeHostBridge = {
  basePath: string;
  user: {
    guest?: boolean;
    neuro?: string[];
    vibe?: string[];
  } | null;
  catalog: {
    neuro?: Array<{ id: string; label: string }>;
    vibe?: Array<{ id: string; label: string }>;
  } | null;
  faces: string[];
  testHref: string;
  hrefFor: (view: string, extra?: any) => string;
  navigate: (view: string, extra?: any) => void;
};
