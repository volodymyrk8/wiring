export function normalizePhotoRef(photo: unknown): string {
  let value = photo;
  if (Array.isArray(value)) value = value[0];
  if (value && typeof value === "object") value = (value as { url?: string }).url;
  return typeof value === "string" ? value.trim() : "";
}

export function hasProfilePhoto(photo: unknown): boolean {
  return normalizePhotoRef(photo).length > 0;
}

export function resolvePhotoUrl(basePath: string, photo: unknown): string | undefined {
  const value = normalizePhotoRef(photo);
  if (!value) return undefined;
  if (value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("http")) return value;
  if (value.startsWith(basePath)) return value;
  return value.startsWith("/") ? `${basePath}${value}` : `${basePath}/public/${value}`;
}

/** Header profile menu only — no generated initial placeholder. */
export function profileMenuAvatarUrl(basePath: string, photo: unknown): string | undefined {
  const url = resolvePhotoUrl(basePath, photo);
  if (!url) return undefined;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  return url.includes("?") ? `${url}&s=sm` : `${url}?s=sm`;
}
