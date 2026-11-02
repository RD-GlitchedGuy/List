import { copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const rootSounds = resolve(projectRoot, "sounds");
const publicSounds = resolve(projectRoot, "src", "public", "sounds");

if (existsSync(rootSounds)) {
  for (const name of readdirSync(rootSounds).filter((file) => file.endsWith(".mp3"))) {
    const source = resolve(rootSounds, name);
    if (statSync(source).size > 0) copyFileSync(source, resolve(publicSounds, name));
  }
}
