import { createHash } from "node:crypto";

export const repository = "mhmdhabibrafi/ASCIT";
export const assetName = "ascit-windows-source.zip";

export function versionParts(version) {
  if (typeof version !== "string" || !/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error("Versi harus berupa rilis stabil, misalnya v1.2.0.");
  }
  return version.replace(/^v/, "").split(".").map(Number);
}

export function newer(candidate, current) {
  const a = versionParts(candidate), b = versionParts(current);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export function releaseInfo(release, current) {
  if (release.draft || release.prerelease) throw new Error("Rilis belum stabil.");
  versionParts(release.tag_name);
  const asset = release.assets?.find((entry) => entry.name === assetName);
  return {
    version: release.tag_name.replace(/^v/, ""),
    notes: String(release.body || "").slice(0, 12000),
    url: `https://github.com/${repository}/releases/tag/${encodeURIComponent(release.tag_name)}`,
    available: newer(release.tag_name, current),
    installable: Boolean(asset && /^sha256:[a-f0-9]{64}$/.test(asset.digest || "")),
    assetId: asset?.id,
    digest: asset?.digest,
    size: asset?.size
  };
}

export function verifyDigest(buffer, digest) {
  if (`sha256:${createHash("sha256").update(buffer).digest("hex")}` !== digest) {
    throw new Error("Checksum paket tidak cocok. Pembaruan dibatalkan.");
  }
}

export async function github(endpoint, token, accept = "application/vnd.github+json") {
  const response = await fetch(`https://api.github.com/repos/${repository}/${endpoint}`, {
    headers: { Accept: accept, "User-Agent": "ASCIT-Updater", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}. Periksa akses repository atau coba lagi nanti.`);
  return response;
}

export async function latest(current, token) {
  return releaseInfo(await (await github("releases/latest", token)).json(), current);
}

export async function activateVersion(previous, next, operations) {
  await operations.stop();
  try {
    await operations.save(next);
    operations.start();
    await operations.healthy();
  } catch (error) {
    await operations.stop();
    await operations.save(previous);
    operations.start();
    try { await operations.healthy(); } catch {
      throw new Error("Versi baru dan pemulihan versi lama gagal. Administrator server perlu memeriksa log.");
    }
    throw new Error(`Versi sebelumnya dipulihkan. ${error.message}`);
  }
}
