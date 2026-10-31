import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { accessMiddleware } from "../../src/middleware/access";
import { sameOriginMiddleware } from "../../src/middleware/same-origin";
import type { AppBindings, Env } from "../../src/platform/env";

const env = { LOCAL_DEV_MODE: "true" } as Env;

function app() {
  const mutation = vi.fn();
  const api = new Hono<AppBindings>();
  api.use("*", sameOriginMiddleware);
  api.use("*", accessMiddleware);
  api.get("/resource", (c) => c.json({ read: true }));
  api.post("/resource", (c) => {
    mutation();
    return c.json({ updated: true });
  });
  return { api, mutation };
}

describe("跨站寫入請求的邊界", () => {
  it.each([
    ["其他網站", { Origin: "https://attacker.example" }],
    ["Origin 為 null", { Origin: "null" }],
    ["沒有 Origin 但標示跨站", { "Sec-Fetch-Site": "cross-site" }],
  ])("%s的寫入在任何登入檢查前被拒絕", async (_label, headers) => {
    const { api, mutation } = app();
    // 本機開發跳過登入時，跨站來源仍不得觸發寫入。
    const response = await api.request(
      "http://localhost:8787/resource",
      { method: "POST", headers: { "Content-Type": "text/plain", ...headers } },
      env,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "CROSS_SITE_REQUEST_BLOCKED" },
    });
    expect(mutation).not.toHaveBeenCalled();
  });

  it.each([
    ["同源", "http://localhost:8787"],
    ["本機 Vite proxy", "http://localhost:5173"],
  ])("%s的寫入照常執行", async (_label, origin) => {
    const { api, mutation } = app();
    const response = await api.request(
      "http://localhost:8787/resource",
      { method: "POST", headers: { Origin: origin } },
      env,
    );
    expect(response.status).toBe(200);
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it("loopback 來源不能寫入正式網域", async () => {
    const { api, mutation } = app();
    const response = await api.request(
      "https://all-set-tw.example.workers.dev/resource",
      { method: "POST", headers: { Origin: "http://localhost:5173" } },
      env,
    );
    expect(response.status).toBe(403);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("讀取請求不受來源限制", async () => {
    const { api } = app();
    const response = await api.request(
      "http://localhost:8787/resource",
      { headers: { Origin: "https://attacker.example" } },
      env,
    );
    expect(response.status).toBe(200);
  });
});
