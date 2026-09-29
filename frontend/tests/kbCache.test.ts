import {
  ALL_KB_NAME,
  LAST_KB_STORAGE_KEY,
  getCachedKbName,
  setCachedKbName,
} from "@/components/DocUtil/kbCache";

describe("kb cache", () => {
  const store: Record<string, string> = {};

  beforeAll(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = String(v);
        },
        removeItem: (k: string) => {
          delete store[k];
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k];
        },
      },
    });
  });

  beforeEach(() => {
    localStorage.removeItem(LAST_KB_STORAGE_KEY);
  });

  it("默认回落 ALL_KB_NAME", () => {
    expect(getCachedKbName()).toBe(ALL_KB_NAME);
  });

  it("写入后跨调用可读", () => {
    setCachedKbName("服装");
    expect(getCachedKbName()).toBe("服装");
    expect(localStorage.getItem(LAST_KB_STORAGE_KEY)).toBe("服装");
  });

  it("空串不覆盖", () => {
    setCachedKbName("服装");
    setCachedKbName("  ");
    expect(getCachedKbName()).toBe("服装");
  });

  it("自定义 fallback", () => {
    expect(getCachedKbName("samples")).toBe("samples");
  });
});
