import { describe, it, expect } from "vitest";
import { first, positiveInt, token } from "./params";

describe("параметры адреса", () => {
  it("первое значение, целое, токен", () => {
    expect(first(["a", "b"])).toBe("a");
    expect(positiveInt("12")).toBe(12);
    expect(positiveInt(["0"])).toBeNull();
    expect(positiveInt("1e3")).toBeNull();
    expect(token("AbCdEfGhIjKlMnOpQrStU")).toBe("AbCdEfGhIjKlMnOpQrStU");
    expect(token("../etc/passwd")).toBeNull();
  });
});
