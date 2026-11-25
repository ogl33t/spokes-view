import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPrefs, savePrefs } from "./prefs";

function stubStorage(impl: Partial<Storage>) {
  vi.stubGlobal("localStorage", impl);
}

afterEach(() => vi.unstubAllGlobals());

describe("prefs", () => {
  it("round-trips through storage", () => {
    const m = new Map<string, string>();
    stubStorage({
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
    });
    expect(loadPrefs()).toEqual({ includeClosed: false, nextOnly: false });
    savePrefs({ includeClosed: true, nextOnly: true });
    expect(loadPrefs()).toEqual({ includeClosed: true, nextOnly: true });
  });

  it("ignores corrupt data", () => {
    stubStorage({ getItem: () => "{nope" });
    expect(loadPrefs()).toEqual({ includeClosed: false, nextOnly: false });
    stubStorage({ getItem: () => '{"includeClosed":"yes"}' });
    expect(loadPrefs()).toEqual({ includeClosed: false, nextOnly: false });
  });

  it("survives a throwing localStorage", () => {
    const boom = () => {
      throw new Error("denied");
    };
    stubStorage({ getItem: boom, setItem: boom });
    expect(loadPrefs()).toEqual({ includeClosed: false, nextOnly: false });
    expect(() => savePrefs({ includeClosed: true, nextOnly: false })).not.toThrow();
  });
});
