const VIDEO_EXT = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|gif)$/i;

/** Profile uploads accept still images only (not iPhone screen recordings / videos). */
export function isProfilePhotoFile(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("video/")) return false;
  if (type.startsWith("image/")) return true;
  const name = (file.name || "").toLowerCase();
  if (VIDEO_EXT.test(name)) return false;
  return IMAGE_EXT.test(name) || type === "";
}

export const PROFILE_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";
