import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * A key whose English value carries a `{{placeholder}}` must be called with the
 * values that fill it. `i18next.t("profile-info.joined")` with no second
 * argument does not throw and does not fall back: it renders the placeholder
 * verbatim, so the UI showed a literal "Joined: {{n}}".
 *
 * `profile-info.joined` had two consumers pulling it in opposite directions:
 * the account info tooltip wants the sentence "Joined: 3 years ago", the
 * username hover card wants a bare cell title with the date printed
 * underneath. The source string flipped between the two forms three times
 * (385596ab67 sentence, fc8a0550e3 label, b83f037f06 back to sentence), and
 * each flip fixed one consumer by breaking the other.
 *
 * Every non-English locale holds the LABEL form, because that is what the
 * string was when Crowdin last translated it, and a source edit does not
 * invalidate an existing translation. So the split keeps `joined` as the label
 * the 18 translations already match, and gives the sentence its own `joined-n`
 * key. Anything else would have made the hover card fall back to English in
 * every locale.
 *
 * No unit test would have caught the original bug: specs/setup-any-spec.ts
 * mocks i18next so `t()` returns the key verbatim, which means a render
 * assertion sees "profile-info.joined" and never the interpolated value. The
 * check has to run against the source and the real locale table instead.
 */
const SRC = path.resolve(__dirname, "../../..");
const LOCALE = path.join(SRC, "features/i18n/locales/en-US.json");

/**
 * Call sites that pass no values for a key that needs them, and are still
 * broken. Each renders its placeholders to the user; listing one here pins the
 * bug rather than hiding it. Fix the site, then delete the entry.
 */
const KNOWN_BROKEN: { file: string; key: string }[] = [];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === "specs") continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

function lookup(table: unknown, key: string): string | undefined {
  let cur: any = table;
  for (const part of key.split(".")) {
    if (typeof cur !== "object" || cur === null || !(part in cur)) return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

/** `t("some.key")` closed immediately: no values argument follows. */
const BARE_T_CALL = /\bt\(\s*"([a-zA-Z0-9._-]+)"\s*\)/g;

describe("i18n keys that interpolate are called with values", () => {
  const locale = JSON.parse(fs.readFileSync(LOCALE, "utf-8"));

  it("has no un-filled placeholder call sites beyond the known-broken list", () => {
    const found: { file: string; key: string }[] = [];

    for (const file of walk(SRC)) {
      const src = fs.readFileSync(file, "utf-8");
      for (const match of src.matchAll(BARE_T_CALL)) {
        const key = match[1];
        const value = lookup(locale, key);
        if (value && value.includes("{{")) {
          found.push({ file: path.relative(SRC, file), key });
        }
      }
    }

    expect(found).toEqual(KNOWN_BROKEN);
  });

  it("keeps the hover card on the label form and the tooltip on the sentence", () => {
    // The label is what every non-English locale already holds, so the hover
    // card must stay on `joined` or it falls back to English everywhere.
    expect(lookup(locale, "profile-info.joined")).toBe("Joined");
    expect(lookup(locale, "profile-info.joined-n")).toContain("{{n}}");

    const preview = fs.readFileSync(
      path.join(SRC, "features/shared/profile-popover/profile-preview/index.tsx"),
      "utf-8"
    );
    expect(preview).toContain('i18next.t("profile-info.joined")');
    expect(preview).not.toContain("profile-info.joined-n");

    const tooltip = fs.readFileSync(
      path.join(SRC, "app/(dynamicPages)/profile/[username]/_components/profile-info/index.tsx"),
      "utf-8"
    );
    expect(tooltip).toContain('i18next.t("profile-info.joined-n", { n: created })');
  });

  it("keeps every locale's joined label in the non-interpolating form", () => {
    // A future Crowdin sync that reintroduces a placeholder here would silently
    // put "{{n}}" back into the hover card title for that language.
    const dir = path.join(SRC, "features/i18n/locales");
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const table = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
      const value = lookup(table, "profile-info.joined");
      if (value !== undefined) {
        expect(`${file}: ${value}`).not.toContain("{{");
      }
    }
  });
});
