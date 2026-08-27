import type { Config, Context } from "@netlify/functions";
import { POST } from "../../app/api/refresh/route";

const allowedOrigin = "https://sohampurohit2502.github.io";

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin === allowedOrigin ? origin : allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export default async (request: Request, _context: Context) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders(request) });
  const result = await POST();
  const headers = new Headers(result.headers);
  Object.entries(corsHeaders(request)).forEach(([key, value]) => headers.set(key, value));
  return new Response(result.body, { status: result.status, statusText: result.statusText, headers });
};

export const config: Config = { path: "/api/refresh" };
