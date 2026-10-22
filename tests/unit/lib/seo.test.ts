import { describe, it, expect, afterEach } from "vitest";
import { languageAlternates, localizedUrl, PUBLIC_PATHS } from "@/lib/seo";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("seo/localizedUrl", () => {
  it("serves es without a prefix and en under /en, on the production host", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(localizedUrl("es", "/")).toBe("https://run.bitbybit.com.ar/");
    expect(localizedUrl("en", "/")).toBe("https://run.bitbybit.com.ar/en");
    expect(localizedUrl("es", "/how-to-play")).toBe(
      "https://run.bitbybit.com.ar/how-to-play"
    );
    expect(localizedUrl("en", "/how-to-play")).toBe(
      "https://run.bitbybit.com.ar/en/how-to-play"
    );
  });
});

describe("seo/languageAlternates", () => {
  it("lists every locale plus x-default pointing at es", () => {
    expect(languageAlternates("/demo")).toEqual({
      es: "https://run.bitbybit.com.ar/demo",
      en: "https://run.bitbybit.com.ar/en/demo",
      "x-default": "https://run.bitbybit.com.ar/demo",
    });
  });
});

describe("seo/PUBLIC_PATHS", () => {
  it("keeps the game, sign-in, offline and gag pages out", () => {
    for (const path of [
      "/play",
      "/sign-in",
      "/offline",
      "/gotcha/free-bitcoin",
    ]) {
      expect(PUBLIC_PATHS).not.toContain(path);
    }
  });
});
