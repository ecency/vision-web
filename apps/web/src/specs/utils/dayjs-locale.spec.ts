import { describe, it, expect } from "vitest";
import dayjs, { setDayjsLocale } from "@/utils/dayjs";

/*
  Pins for #1668 item 1: locale tables must not ship eagerly (they rode in the
  pre-paint chunk wave), but the language-change path must still localize.
  Test order matters: the eager-registration check has to run before any
  setDayjsLocale call registers a table into the shared dayjs instance.
*/
describe("dayjs locale loading (#1668)", () => {
  it("registers no locale tables at import time", () => {
    const registered = Object.keys((dayjs as unknown as { Ls: Record<string, unknown> }).Ls);
    expect(registered).toEqual(["en"]);
  });

  it("loads and applies a table on demand from a regional i18next code", async () => {
    await setDayjsLocale("es-ES");
    expect(dayjs.locale()).toBe("es");
    await setDayjsLocale("zh-CN");
    expect(dayjs.locale()).toBe("zh-cn");
  });

  it("keeps the current locale for languages without a bundled table", async () => {
    await setDayjsLocale("es-ES");
    await setDayjsLocale("fr-FR");
    expect(dayjs.locale()).toBe("es");
  });

  it("returns to built-in english", async () => {
    await setDayjsLocale("en-US");
    expect(dayjs.locale()).toBe("en");
  });
});

describe("dayjs locale race protection (#1669 review)", () => {
  it("ignores an older request that resolves after a newer one", async () => {
    await setDayjsLocale("es-ES"); // warm the es table so the newer call applies instantly
    // Older request needs an uncached chunk (slow); newer hits the cache
    // (instant). Without the stale-request guard the late-resolving older
    // request would overwrite the newer selection with "ru".
    const older = setDayjsLocale("ru-RU");
    const newer = setDayjsLocale("es-ES");
    await Promise.all([older, newer]);
    expect(dayjs.locale()).toBe("es");
  });
});
