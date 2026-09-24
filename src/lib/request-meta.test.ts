import { describe, it, expect } from "vitest";
import { requestMeta } from "./request-meta";

describe("requestMeta", () => {
  it("первый адрес из X-Forwarded-For, мусор отбрасывается", () => {
    expect(requestMeta(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1", "user-agent": "UA" }))).toEqual({ ip: "203.0.113.5", userAgent: "UA" });
    expect(requestMeta(new Headers({ "x-forwarded-for": "not-an-ip" }))).toEqual({ ip: undefined, userAgent: undefined });
    expect(requestMeta(new Headers({ "x-real-ip": "::1" })).ip).toBe("::1");
  });
});
