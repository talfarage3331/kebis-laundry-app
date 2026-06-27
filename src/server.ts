import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { setServerEnv } from "./lib/server-env";
import { resolveSlugToBrand } from "./lib/resolve-slug.server";

// ── Cloudflare HTMLRewriter ambient declaration ────────────────────────────
// @cloudflare/workers-types is not installed; declare only what we use here.
interface HRElement {
  setInnerContent(content: string, options?: { html?: boolean }): void;
  onEndTag(handler: (tag: { before(content: string, options?: { html?: boolean }): void }) => void): void;
}
declare class HTMLRewriter {
  on(selector: string, handlers: {
    element?: (el: HRElement) => void;
    comments?: (comment: unknown) => void;
    text?: (text: unknown) => void;
  }): this;
  transform(response: Response): Response;
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
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

// ── OpenGraph / Social Crawler logic ──────────────────────────────────────

/** Known social media bot User-Agent substrings. */
const CRAWLER_UA_PATTERNS = [
  "facebookexternalhit",
  "Facebot",
  "Twitterbot",
  "WhatsApp",
  "TelegramBot",
  "LinkedInBot",
  "Slackbot",
  "Discordbot",
  "Googlebot",
  "bingbot",
  "DuckDuckBot",
  "ia_archiver",
  "outbrain",
  "pinterest",
  "vkShare",
];

function isSocialCrawler(request: Request): boolean {
  const ua = request.headers.get("User-Agent") || "";
  return CRAWLER_UA_PATTERNS.some((p) => ua.toLowerCase().includes(p.toLowerCase()));
}

/**
 * Extract the laundry slug from an incoming request, supporting:
 *   /shop/<slug>         (path-based)
 *   /login?slug=<slug>   (query param)
 *   /signup?slug=<slug>  (query param)
 */
function extractSlugFromRequest(url: URL): string | null {
  // Path-based: /shop/<slug>
  const pathMatch = url.pathname.match(/^\/shop\/([^/?#]+)/);
  if (pathMatch) return decodeURIComponent(pathMatch[1]);

  // Query-param based: ?slug=<slug>
  const paramSlug = url.searchParams.get("slug");
  if (paramSlug) return paramSlug;

  return null;
}

/**
 * Inject branded OpenGraph meta tags and/or a synchronous brand configuration
 * script into an HTML response using Cloudflare's native HTMLRewriter.
 *
 * This allows client-side React code to read the resolved brand assets
 * instantly on mount, bypassing Firestore query rules / CORS for guests.
 */
function rewriteHTML(
  response: Response,
  slug: string,
  brand: { name: string; logoUrl: string | null; brandColor: string | null },
  fullUrl: string,
  isCrawler: boolean,
): Response {
  const laundryName = brand.name;
  const ogTitle = `\u05de\u05db\u05d1\u05e1\u05ea ${laundryName} \u05de\u05d6\u05de\u05d9\u05e0\u05ea \u05d0\u05d5\u05ea\u05da \u05dc\u05d4\u05d6\u05de\u05d9\u05df \u05d0\u05d9\u05e1\u05d5\u05e3 \u05db\u05d1\u05d9\u05e1\u05d4 \u05d1\u05e7\u05dc\u05d9\u05e7`;
  const ogDesc = `\u05d4\u05e6\u05d8\u05e8\u05e4\u05d5 \u05dc${laundryName} \u2014 \u05e9\u05d9\u05e8\u05d5\u05ea \u05db\u05d1\u05d9\u05e1\u05d4 \u05de\u05e7\u05e6\u05d5\u05e2\u05d9 \u05e2\u05dd \u05d0\u05d9\u05e1\u05d5\u05e3, \u05de\u05e2\u05e7\u05d1 \u05d5\u05ea\u05e9\u05dc\u05d5\u05dd \u05d1\u05dc\u05d7\u05d9\u05e6\u05d4`;

  const brandData = {
    slug,
    brandName: brand.name,
    brandLogoUrl: brand.logoUrl,
    brandColor: brand.brandColor,
  };
  const brandScript = `\n    <script>\n      window.__LAUNDRY_BRAND__ = ${JSON.stringify(brandData)};\n    </script>\n  `;

  const hasRemoteLogo = brand.logoUrl?.startsWith("https://");
  const extraTags = [
    `<meta property="og:title" content="${ogTitle}" />`,
    `<meta property="og:description" content="${ogDesc}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${fullUrl}" />`,
    ...(hasRemoteLogo ? [`<meta property="og:image" content="${brand.logoUrl}" />`] : []),
  ].join("\n    ");

  const rewriter = new HTMLRewriter();

  if (isCrawler) {
    rewriter.on("title", {
      element(el) {
        el.setInnerContent(ogTitle);
      },
    });
  }

  rewriter.on("head", {
    element(el) {
      el.onEndTag((end) => {
        if (isCrawler) {
          end.before(`\n    ${extraTags}\n  `, { html: true });
        }
        end.before(brandScript, { html: true });
      });
    },
  });

  return rewriter.transform(response);
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      if (env) {
        setServerEnv(env);
      }
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
            },
          );
        }
      }

      // ── OpenGraph / Brand injection for GET requests with a slug ─────────
      const isGet = request.method === "GET";
      const slug  = isGet ? extractSlugFromRequest(url) : null;

      if (isGet && slug) {
        const isCrawler = isSocialCrawler(request);
        // Resolve brand + render HTML in parallel for minimal added latency
        const [brandResult, handler] = await Promise.all([
          resolveSlugToBrand(slug).catch(() => null),
          getServerEntry(),
        ]);

        const ssrResponse = await handler.fetch(request, env, ctx);
        const normalized  = await normalizeCatastrophicSsrResponse(ssrResponse);

        // Only rewrite HTML responses
        const ct = normalized.headers.get("content-type") ?? "";
        if (brandResult && ct.includes("text/html")) {
          return rewriteHTML(normalized, slug, brandResult, request.url, isCrawler);
        }
        return normalized;
      }
      // ── Normal (non-crawler) request path ────────────────────────────────

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
