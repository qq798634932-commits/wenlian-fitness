export function corsHeaders(request: Request) {
  const configuredOrigin = Deno.env.get("PUBLIC_SITE_URL") ?? "";
  const requestOrigin = request.headers.get("origin") ?? "";
  const allowedOrigin = requestOrigin && requestOrigin === configuredOrigin
    ? requestOrigin
    : configuredOrigin;

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
