import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

// Simple in-memory Rate Limiting cache for Cloudflare Worker Isolate
// Fixed-window: 100 requests per minute per IP.
const rateLimitCache = new Map<string, { count: number; resetTime: number }>();
const LIMIT_PER_MINUTE = 100;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const client = rateLimitCache.get(ip);

  if (!client || now > client.resetTime) {
    rateLimitCache.set(ip, {
      count: 1,
      resetTime: now + 60000,
    });
    return false;
  }

  client.count += 1;
  if (client.count > LIMIT_PER_MINUTE) {
    return true;
  }
  return false;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const ip = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
      const url = new URL(request.url);

      // Protect SSR rendering and sensitive page paths from denial of service
      if (
        url.pathname === "/login" ||
        url.pathname === "/signup" ||
        url.pathname === "/" ||
        url.pathname.startsWith("/api")
      ) {
        if (isRateLimited(ip)) {
          return new Response(
            JSON.stringify({ error: "Too many requests. Please try again in a minute." }),
            {
              status: 429,
              headers: {
                "content-type": "application/json",
                "Retry-After": "60",
              },
            }
          );
        }
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};

