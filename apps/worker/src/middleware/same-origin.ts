import type { ApiErrorResponse } from "@taiwan-fin-hub/shared";
import { honoFactory } from "../platform/hono";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * 瀏覽器會在跨站請求附上 Access cookie，且 json validator 會把非 JSON body 當成 {}，
 * 因此寫入請求必須確認來自本站；本機開發時 Vite proxy 的 loopback 來源視為同站。
 */
export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("Origin");
  if (origin === null) {
    // 非瀏覽器用戶端不送 Origin；瀏覽器的跨站請求另以 Sec-Fetch-Site 標示。
    return request.headers.get("Sec-Fetch-Site") !== "cross-site";
  }

  let source: URL;
  try {
    source = new URL(origin);
  } catch {
    // Origin: null（sandbox iframe、file://）無法證明來自本站。
    return false;
  }

  const target = new URL(request.url);
  if (source.origin === target.origin) return true;
  return (
    LOOPBACK_HOSTS.has(target.hostname) && LOOPBACK_HOSTS.has(source.hostname)
  );
}

export const sameOriginMiddleware = honoFactory.createMiddleware(
  async (c, next) => {
    if (
      SAFE_METHODS.has(c.req.method.toUpperCase()) ||
      isSameOriginRequest(c.req.raw)
    ) {
      await next();
      return;
    }

    return c.json(
      {
        success: false as const,
        error: {
          code: "CROSS_SITE_REQUEST_BLOCKED",
          message: "Cross-site write requests are not allowed.",
        },
      } satisfies ApiErrorResponse,
      403,
    );
  },
);
