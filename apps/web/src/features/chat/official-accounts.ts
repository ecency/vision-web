/** Esie, the Ecency AI helper. It answers in chat, so it needs a chat session. */
export const ESIE_USERNAME = "esie";

/** Opens (or starts) the conversation with Esie. */
export const ASK_ESIE_HREF = `/chats?dm=${ESIE_USERNAME}`;

/** Accounts run by Ecency. They get the official badge wherever they appear in chat. */
export const OFFICIAL_CHAT_ACCOUNTS: readonly string[] = [ESIE_USERNAME, "ecency"];

export function isOfficialChatAccount(username?: string | null): boolean {
  return !!username && OFFICIAL_CHAT_ACCOUNTS.includes(username.replace(/^@/, "").toLowerCase());
}

// Letters that render like Latin ones (Cyrillic, Greek, small capitals) and digits or symbols used in their place
const LOOKALIKES: Record<string, string> = {
  а: "a", е: "e", ё: "e", о: "o", с: "c", у: "y", ү: "y", і: "i", ї: "i", ј: "j", ѕ: "s", ӏ: "i", к: "k",
  п: "n", р: "p", х: "x", һ: "h", ԁ: "d",
  α: "a", ε: "e", ο: "o", ι: "i", ν: "v", κ: "k", ς: "s", ϲ: "c", γ: "y",
  ı: "i", ɩ: "i", ɛ: "e", ᴇ: "e", ᴄ: "c", ɴ: "n", ʏ: "y", ꜱ: "s",
  "¢": "c", "0": "o", "1": "i", "!": "i", "|": "i", l: "i", "3": "e", "4": "a", "@": "a", "5": "s", $: "s"
};

// A letter or digit still unknown after the mapping above matches any one letter
const ANY = "*";

/** The name's words in Latin letters. A run of single letters ("E s i e", "E.s.i.e") is one word. */
function nameWords(text: string): string[] {
  // the table first: decomposing can turn a lookalike into something else (lunate ϲ into ς)
  const latin = Array.from(text.toLowerCase())
    .flatMap((ch) => LOOKALIKES[ch] ?? Array.from(ch.normalize("NFKD").replace(/\p{M}/gu, "")))
    .map((ch) => LOOKALIKES[ch] ?? ch)
    .map((ch) => (/[a-z]/.test(ch) ? ch : /[\p{L}\p{N}]/u.test(ch) ? ANY : " "))
    .join("");
  const words: string[] = [];
  let letters = "";
  for (const word of latin.split(" ").filter(Boolean)) {
    if (word.length === 1) {
      letters += word;
      continue;
    }
    if (letters) words.push(letters);
    letters = "";
    words.push(word);
  }
  if (letters) words.push(letters);
  return words;
}

// A word starting with the official name, allowing one letter we could not read
const startsLike = (word: string, official: string) => {
  if (word.length < official.length) return false;
  let unknown = 0;
  for (let i = 0; i < official.length; i++) {
    if (word[i] === ANY) unknown++;
    else if (word[i] !== official[i]) return false;
  }
  return unknown <= 1;
};

/**
 * True when someone else's display name reads as an official account ("Esie", "Ecency Support",
 * "E-s-i-e", "Еcency" with a Cyrillic Е), so chat shows their @username instead and the badge
 * stays the only mark of the real one. A word has to start with the name: "Decency" and
 * "Jane Siegel" are left alone.
 */
export function impersonatesOfficialAccount(displayName?: string | null, username?: string | null): boolean {
  if (!displayName || isOfficialChatAccount(username)) return false;
  const words = nameWords(displayName);
  return OFFICIAL_CHAT_ACCOUNTS.some((official) => words.some((word) => startsLike(word, official)));
}

/** A name someone chose, or nothing when it poses as an official account. */
export function safeChatName(name?: string | null, username?: string | null): string | undefined {
  return name && !impersonatesOfficialAccount(name, username) ? name : undefined;
}
