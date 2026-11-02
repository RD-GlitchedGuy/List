const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "9": "g",
};

const BLOCKED = [
  "fck", "fuck", "fuk", "niger", "nigger", "hurensohn", "hurenson", "dumm",
  "behindert", "behidert", "idiot", "arschloch", "wichser", "scheisse", "scheiße",
];

export function filterChat(text: string): string {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[014579]/g, (character) => LEET[character])
    .replace(/[^a-z]/g, "");
  return BLOCKED.some((word) => normalized.includes(word)) ? "************" : text;
}
