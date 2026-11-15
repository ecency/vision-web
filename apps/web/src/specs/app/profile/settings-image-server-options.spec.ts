import { describe, expect, it } from "vitest";
import { ALLOWED_IMAGE_SERVERS } from "@/defaults";
import { IMAGE_SERVER_OPTIONS } from "@/app/(dynamicPages)/profile/[username]/settings/_image-server-options";
import enUS from "@/features/i18n/locales/en-US.json";

// The preferences select used to pair labels with ALLOWED_IMAGE_SERVERS by index, so
// "Hive images" pointed at images.ecency.com and "No CDN" at images.hive.blog (#1973).

function label(value: string) {
  const option = IMAGE_SERVER_OPTIONS.find((o) => o.value === value);
  if (!option) return undefined;
  return option.labelKey
    .split(".")
    .reduce<any>((node, key) => (node == null ? undefined : node[key]), enUS);
}

describe("image server preference options", () => {
  it("labels each server by what it is", () => {
    expect(label("https://i.ecency.com")).toMatch(/Default/);
    expect(label("https://images.hive.blog")).toMatch(/Hive/);
    expect(label("https://img.ecency.com")).toMatch(/No CDN/);
    expect(label("https://images.ecency.com")).toMatch(/Ecency/);
  });

  it("offers only allowed servers, each with a real en-US label", () => {
    for (const option of IMAGE_SERVER_OPTIONS) {
      expect(ALLOWED_IMAGE_SERVERS).toContain(option.value);
      expect(typeof label(option.value)).toBe("string");
    }
  });
});
