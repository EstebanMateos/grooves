import { describe, expect, it, vi } from "vitest";
import { createSafeBrowserStorage, getBrowserStorage } from "./safeStorage";

describe("createSafeBrowserStorage", () => {
    it("uses browser storage when available", () => {
        const backing = new Map<string, string>();
        const storage = createSafeBrowserStorage({
            getItem: (key) => backing.get(key) ?? null,
            setItem: (key, value) => {
                backing.set(key, value);
            },
            removeItem: (key) => {
                backing.delete(key);
            }
        });

        storage.setItem("session", "abc");
        expect(storage.getItem("session")).toBe("abc");
        storage.removeItem("session");
        expect(storage.getItem("session")).toBeNull();
    });

    it("falls back to memory when browser storage throws", () => {
        const storage = createSafeBrowserStorage({
            getItem: vi.fn(() => {
                throw new Error("blocked");
            }),
            setItem: vi.fn(() => {
                throw new Error("blocked");
            }),
            removeItem: vi.fn(() => {
                throw new Error("blocked");
            })
        });

        storage.setItem("session", "abc");
        expect(storage.getItem("session")).toBe("abc");
        storage.removeItem("session");
        expect(storage.getItem("session")).toBeNull();
    });

    it("works without a browser storage object", () => {
        const storage = createSafeBrowserStorage(undefined);

        storage.setItem("session", "abc");
        expect(storage.getItem("session")).toBe("abc");
        storage.removeItem("session");
        expect(storage.getItem("session")).toBeNull();
    });

    it("returns undefined when accessing global localStorage throws", () => {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            get: () => {
                throw new Error("blocked");
            }
        });

        expect(getBrowserStorage()).toBeUndefined();

        if (descriptor) {
            Object.defineProperty(globalThis, "localStorage", descriptor);
        }
    });
});
