let enabled = true;
let desiredMusic: string | null = null;
let music: HTMLAudioElement | null = null;
let musicFor: string | null = null;
let gameMusicIndex = 1;
const failedGameMusic = new Set<number>();
const activeSounds = new Set<HTMLAudioElement>();

function soundUrl(name: string) {
  return new URL(`./sounds/${name}.mp3`, document.baseURI).href;
}

function playMusicTrack(baseName: string, index = 1) {
  const fileName = baseName === "game_music" && index > 1 ? `${baseName}_${index}` : baseName;
  const currentMusic = new Audio(soundUrl(fileName));
  currentMusic.volume = 1;
  currentMusic.loop = baseName !== "game_music";
  music = currentMusic;
  musicFor = baseName;

  if (baseName === "game_music") {
    const advance = (failed: boolean) => {
      if (music !== currentMusic || desiredMusic !== baseName) return;
      if (failed) failedGameMusic.add(index);
      for (let offset = 1; offset <= 15; offset++) {
        const nextIndex = ((index - 1 + offset) % 15) + 1;
        if (failedGameMusic.has(nextIndex)) continue;
        gameMusicIndex = nextIndex;
        playMusicTrack(baseName, nextIndex);
        return;
      }
      music = null;
      musicFor = null;
    };
    currentMusic.addEventListener("ended", () => advance(false), { once: true });
    currentMusic.addEventListener("error", () => advance(true), { once: true });
  }
  void currentMusic.play().catch(() => {});
}

function startMusic() {
  if (!enabled || !desiredMusic) return;
  if (musicFor !== desiredMusic || !music) {
    if (desiredMusic === "game_music") {
      if (failedGameMusic.size === 15) return;
      playMusicTrack(desiredMusic, gameMusicIndex);
    } else {
      playMusicTrack(desiredMusic);
    }
    return;
  }
  if (music.paused) void music.play().catch(() => {});
}

export function setSoundsEnabled(value: boolean) {
  enabled = value;
  if (!enabled) {
    stopSounds();
  } else {
    startMusic();
  }
}

export function setMusicTrack(name: string | null) {
  if (desiredMusic === name) {
    startMusic();
    return;
  }
  music?.pause();
  music = null;
  musicFor = null;
  desiredMusic = name;
  if (name === "game_music") {
    gameMusicIndex = 1;
    failedGameMusic.clear();
  }
  startMusic();
}

export function resumeAudioAfterGesture() {
  if (!enabled) return;
  startMusic();
}

export function playSoundFile(name: string) {
  if (!enabled) return;
  const sound = new Audio(soundUrl(name));
  sound.volume = 1;
  activeSounds.add(sound);
  let settled = false;
  const cleanup = () => {
    if (settled) return false;
    settled = true;
    activeSounds.delete(sound);
    sound.removeEventListener("error", onError);
    sound.removeEventListener("ended", cleanup);
    return true;
  };
  const onError = () => {
    cleanup();
  };
  sound.addEventListener("error", onError, { once: true });
  sound.addEventListener("ended", cleanup, { once: true });
  void sound.play().catch(onError);
}

export function playButtonSound() {
  playSoundFile("button_press");
}

export function stopSounds() {
  music?.pause();
  for (const sound of activeSounds) sound.pause();
  activeSounds.clear();
}
