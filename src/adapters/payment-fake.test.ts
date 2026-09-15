import { describe, it, expect } from "vitest";
import { createFakePaymentProvider, fakeSignature } from "./payment-fake";

const p = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "s" });
const notify = (body: unknown) => new Request("http://x/notify", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("fake payment provider", () => {
  it("создаёт ссылку на dev-страницу оплаты", async () => {
    const r = await p.createPayment({ paymentId: 7, amountKopecks: 40000, description: "x", returnUrl: "http://localhost:3000/moya-zapis/abc", email: "a@b.c" });
    expect(r.externalId).toBe("fake-7");
    expect(r.payUrl).toContain("/dev/oplata/fake-7");
  });
  it("принимает подписанное уведомление", async () => {
    const sig = fakeSignature("s", "fake-7", "paid", 40000);
    const r = await p.parseNotification(notify({ externalId: "fake-7", status: "paid", amountKopecks: 40000, signature: sig }));
    expect(r).toMatchObject({ externalId: "fake-7", status: "paid", amountKopecks: 40000 });
  });
  it("отвергает чужую подпись и не-JSON", async () => {
    const bad = await p.parseNotification(notify({ externalId: "fake-7", status: "paid", amountKopecks: 40000, signature: "00" }));
    expect(bad).toEqual({ invalid: "подпись не сошлась" });
    const notJson = await p.parseNotification(new Request("http://x/notify", { method: "POST", body: "{" }));
    expect(notJson).toEqual({ invalid: "тело не JSON" });
  });
});
