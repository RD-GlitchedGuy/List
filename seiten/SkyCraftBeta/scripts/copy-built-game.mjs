import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const builtFile = resolve(projectRoot, "dist", "index.html");
if (!existsSync(builtFile)) throw new Error("The single-file build did not produce dist/index.html.");

copyFileSync(builtFile, resolve(projectRoot, "index.html"));
const sourceSounds = resolve(projectRoot, "src", "public", "sounds");
const rootSounds = resolve(projectRoot, "sounds");
const distSounds = resolve(projectRoot, "dist", "sounds");
mkdirSync(rootSounds, { recursive: true });
mkdirSync(distSounds, { recursive: true });
const soundReadme = resolve(sourceSounds, "README.txt");
if (existsSync(soundReadme)) {
  copyFileSync(soundReadme, resolve(rootSounds, "README.txt"));
  copyFileSync(soundReadme, resolve(distSounds, "README.txt"));
}
for (const name of readdirSync(sourceSounds).filter((file) => file.endsWith(".mp3"))) {
  const rootSound = resolve(rootSounds, name);
  if (!existsSync(rootSound)) copyFileSync(resolve(sourceSounds, name), rootSound);
  copyFileSync(rootSound, resolve(distSounds, name));
}
for (const name of readdirSync(rootSounds).filter((file) => file.endsWith(".mp3"))) {
  copyFileSync(resolve(rootSounds, name), resolve(distSounds, name));
}
console.log("Copied the single-file game to the project root.");
