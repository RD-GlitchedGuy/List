import { setAtlasResourcePack, TILE_NAMES } from "./blocks";
import { unzipSync } from "fflate";

export type ResourceLook = "default" | "classic" | "vibrant" | "midnight";
export interface ResourcePack {
  id: string;
  name: string;
  look: ResourceLook;
  textures?: Record<string, string>;
}

const PACKS_KEY = "skycraft-resource-packs-v1";
const ACTIVE_KEY = "skycraft-active-resource-pack-v1";
const MAX_PACK_SIZE = 1_000_000;
const MAX_ZIP_SIZE = 8_000_000;
export const RESOURCE_TEXTURE_NAMES = TILE_NAMES;
const BUILT_IN_PACKS: ResourcePack[] = [
  { id: "default", name: "resources.default", look: "default" },
  { id: "classic", name: "resources.classic", look: "classic" },
  { id: "vibrant", name: "resources.vibrant", look: "vibrant" },
  { id: "midnight", name: "resources.midnight", look: "midnight" },
];

export function getResourcePacks(): ResourcePack[] {
  const stored = localStorage.getItem(PACKS_KEY);
  if (!stored) return [...BUILT_IN_PACKS];
  const custom: unknown = JSON.parse(stored);
  if (!Array.isArray(custom) || !custom.every((pack) =>
    pack && typeof pack.id === "string" && typeof pack.name === "string" &&
    (pack.look === "default" || pack.look === "classic" || pack.look === "vibrant" || pack.look === "midnight") &&
    (!pack.textures || typeof pack.textures === "object" && Object.entries(pack.textures).every(([key, value]) =>
      TILE_NAMES.includes(key) && typeof value === "string" && value.startsWith("data:image/")))
  )) throw new Error("resources.invalidStored");
  return [...BUILT_IN_PACKS, ...custom];
}

export function getActiveResourcePackId(): string {
  const id = localStorage.getItem(ACTIVE_KEY) || "default";
  return getResourcePacks().some((pack) => pack.id === id) ? id : "default";
}

export function activateResourcePack(id: string) {
  const pack = getResourcePacks().find((candidate) => candidate.id === id);
  if (!pack) throw new Error("resources.notFound");
  localStorage.setItem(ACTIVE_KEY, id);
  setAtlasResourcePack(pack.look, pack.textures || {});
}

export function initializeResourcePack() {
  activateResourcePack(getActiveResourcePackId());
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("resources.readFailed"));
    reader.onerror = () => reject(new Error("resources.readFailed"));
    reader.readAsDataURL(file);
  });
}

export async function importResourcePack(files: FileList | File[]): Promise<ResourcePack> {
  const uploaded = Array.from(files);
  const selected: File[] = [];
  for (const file of uploaded) {
    if (!/\.zip$/i.test(file.name)) {
      selected.push(file);
      continue;
    }
    if (file.size > MAX_ZIP_SIZE) throw new Error("resources.tooLarge");
    const archive = new Uint8Array(await file.arrayBuffer());
    validateZipSize(archive);
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(archive, {
        filter: (entry) => entry.originalSize <= MAX_PACK_SIZE && (isManifestPath(entry.name) || isTexturePath(entry.name)),
      });
    } catch {
      throw new Error("resources.invalidZip");
    }
    for (const [path, data] of Object.entries(entries)) {
      if (isManifestPath(path)) {
        selected.push(new File([data.slice().buffer as ArrayBuffer], path, { type: "application/json" }));
      } else if (isTexturePath(path)) {
        selected.push(new File([data.slice().buffer as ArrayBuffer], path, { type: imageType(path) }));
      }
    }
  }
  if (!selected.length) throw new Error("resources.emptyFolder");
  const manifestFile = selected.find((file) => /(^|\/)manifest\.json$/i.test(file.webkitRelativePath || file.name));
  let name = (selected[0].webkitRelativePath || selected[0].name).split("/")[0] || "Custom";
  if (manifestFile) {
    let manifest: unknown;
    try {
      manifest = JSON.parse(await manifestFile.text());
    } catch {
      throw new Error("resources.invalidManifest");
    }
    if (!manifest || typeof manifest !== "object" || !("name" in manifest) || typeof manifest.name !== "string" || !manifest.name.trim()) {
      throw new Error("resources.invalidManifest");
    }
    name = manifest.name.trim().slice(0, 40);
  }

  const textures: Record<string, string> = {};
  let totalSize = 0;
  for (const file of selected) {
    const path = (file.webkitRelativePath || file.name).replace(/\\/g, "/");
    const match = /([^/]+)\.(png|webp|jpe?g)$/i.exec(path);
    if (!match) continue;
    const key = match[1].toLowerCase();
    if (!TILE_NAMES.includes(key)) continue;
    if (!file.type.startsWith("image/")) throw new Error("resources.invalidImage");
    totalSize += file.size;
    if (totalSize > MAX_PACK_SIZE) throw new Error("resources.tooLarge");
    const bitmap = await createImageBitmap(file);
    if (bitmap.width > 1024 || bitmap.height > 1024) {
      bitmap.close();
      throw new Error("resources.tooLarge");
    }
    bitmap.close();
    textures[key] = await readDataUrl(file);
  }
  if (!Object.keys(textures).length) throw new Error("resources.noTextures");
  const pack: ResourcePack = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    look: "default",
    textures,
  };
  const packs = getResourcePacks().filter((candidate) => candidate.id.startsWith("custom-"));
  const serialized = JSON.stringify([...packs, pack]);
  if (serialized.length > MAX_PACK_SIZE * 2) throw new Error("resources.tooLarge");
  try {
    localStorage.setItem(PACKS_KEY, serialized);
  } catch {
    throw new Error("resources.storageFailed");
  }
  return pack;
}

function isManifestPath(path: string) {
  return /(^|\/)manifest\.json$/i.test(path.replace(/\\/g, "/"));
}

function isTexturePath(path: string) {
  const name = path.replace(/\\/g, "/").split("/").pop() || "";
  const match = /(.+)\.(png|webp|jpe?g)$/i.exec(name);
  return !!match && TILE_NAMES.includes(match[1].toLowerCase());
}

function imageType(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : "image/png";
}

function validateZipSize(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let total = 0, entries = 0, foundDirectory = false;
  for (let offset = 0; offset + 46 <= data.length;) {
    if (view.getUint32(offset, true) !== 0x02014b50) { offset++; continue; }
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > data.length) throw new Error("resources.invalidZip");
    const name = new TextDecoder().decode(data.subarray(offset + 46, offset + 46 + nameLength));
    if (name.endsWith("/")) foundDirectory = true;
    if ((isManifestPath(name) || isTexturePath(name)) && !name.endsWith("/")) {
      total += uncompressedSize;
      entries++;
      if (total > MAX_PACK_SIZE || uncompressedSize > MAX_PACK_SIZE || compressedSize > MAX_ZIP_SIZE) {
        throw new Error("resources.tooLarge");
      }
    }
    offset = entryEnd;
  }
  if (!entries && !foundDirectory) throw new Error("resources.invalidZip");
}

export function deleteResourcePack(id: string) {
  if (!id.startsWith("custom-")) return;
  const wasActive = getActiveResourcePackId() === id;
  const custom = getResourcePacks().filter((pack) => pack.id.startsWith("custom-") && pack.id !== id);
  localStorage.setItem(PACKS_KEY, JSON.stringify(custom));
  if (wasActive) activateResourcePack("default");
}

export const RESOURCE_PACK_STRUCTURE = JSON.stringify({
  name: "Mein Ressourcenpaket",
  textures: "textures/",
  instructions: "Lege PNG-Bilder mit den Textur-Namen in textures/ ab. Erlaubte Namen findest du im Ressourcenpaket-Menü.",
}, null, 2);
