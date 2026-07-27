export type MusicPlatform = "netease" | "qq" | "local";

function extractWebUrl(value: string) {
  return value.trim().match(/https?:\/\/[^\s]+/i)?.[0]?.replace(/[，。；、)）]+$/, "") ?? "";
}

export function parseNeteasePlaylistId(value: string) {
  const input = value.trim();
  if (/^\d+$/.test(input)) return input;

  const embeddedId = input.match(/[?&#]id=(\d+)/)?.[1] ?? input.match(/\/playlist\/(\d+)/)?.[1];
  if (embeddedId) return embeddedId;

  const webUrl = extractWebUrl(input);
  if (!webUrl) return null;

  try {
    const url = new URL(webUrl);
    if (!url.hostname.endsWith("music.163.com")) return null;
    return url.searchParams.get("id")?.match(/^\d+$/)?.[0] ?? url.pathname.match(/\/playlist\/(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function normalizeQQMusicUrl(value: string) {
  const webUrl = extractWebUrl(value) || value.trim();
  if (!webUrl) return null;

  try {
    const url = new URL(webUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.hostname !== "qq.com" && !url.hostname.endsWith(".qq.com")) return null;
    url.protocol = "https:";
    return url.toString();
  } catch {
    return null;
  }
}

export function neteasePlayerUrl(playlistId: string) {
  const params = new URLSearchParams({
    type: "0",
    id: playlistId,
    auto: "0",
    height: "430",
  });
  return `https://music.163.com/outchain/player?${params.toString()}`;
}
