/** Display name and avatar constraints for the in-app profile. */

export const DISPLAY_NAME_MAX = 40;
export const AVATAR_DATA_MAX = 80_000;

export function validateDisplayName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Name cannot be empty.";
  if (trimmed.length > DISPLAY_NAME_MAX) {
    return `Name must be at most ${DISPLAY_NAME_MAX} characters.`;
  }
  if (/[\u0000-\u001f]/.test(trimmed)) return "Name contains invalid characters.";
  return null;
}

export function validateAvatarData(data: string): string | null {
  if (typeof data !== "string") return "Invalid image.";
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(data)) {
    return "Use a JPEG, PNG, or WebP image.";
  }
  if (data.length > AVATAR_DATA_MAX) return "Image is too large. Try a smaller photo.";
  return null;
}

export function githubAvatarUrl(username: string): string {
  return `https://github.com/${encodeURIComponent(username)}.png?size=128`;
}
