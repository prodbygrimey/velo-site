// POST /api/pixel-token
// Body: { message_id, campaign_id, recipient_id, ttl_seconds? }
// Returns: { url, token, payload }

function base64UrlEncode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function unauthorized() {
  return jsonResponse({ error: "unauthorized" }, 401, { "www-authenticate": "Bearer" });
}

async function hmacSha256(secret, dataStr) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(dataStr));
  return new Uint8Array(sig);
}

export async function onRequest({ request, env }) {
  // CORS (optional but handy if VALA ever runs in a browser context)
  const origin = request.headers.get("origin") || "*";
  const corsHeaders = {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  };

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);

  // Auth
  const auth = request.headers.get("authorization") || "";
  const expected = env.PIXEL_API_TOKEN;
  if (!expected) return jsonResponse({ error: "server_not_configured" }, 500, corsHeaders);
  if (!auth.startsWith("Bearer ")) return unauthorized();
  const token = auth.slice("Bearer ".length).trim();
  if (token !== expected) return unauthorized();

  // Validate env
  if (!env.PIXEL_SECRET) return jsonResponse({ error: "missing_PIXEL_SECRET" }, 500, corsHeaders);

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400, corsHeaders);
  }

  const message_id = String(body.message_id || "").trim();
  const campaign_id = String(body.campaign_id || "").trim();
  const recipient_id = String(body.recipient_id || "").trim();

  if (!message_id || !campaign_id || !recipient_id) {
    return jsonResponse(
      { error: "missing_fields", required: ["message_id", "campaign_id", "recipient_id"] },
      400,
      corsHeaders
    );
  }

  // TTL
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = Number.isFinite(body.ttl_seconds) ? Math.max(60, Math.floor(body.ttl_seconds)) : 45 * 24 * 3600;

  // Build payload compatible with your existing pixel code/script:
  // m=message_id, c=campaign_id, r=recipient_id, tid=token_id, iat/exp
  const token_id = crypto.randomUUID();
  const payloadObj = {
    m: message_id,
    c: campaign_id,
    r: recipient_id,
    tid: token_id,
    iat: now,
    exp: now + ttlSeconds,
  };

  const payloadJson = JSON.stringify(payloadObj);
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(payloadJson));

  // signature = HMAC_SHA256(secret, payloadB64)
  const sigBytes = await hmacSha256(env.PIXEL_SECRET, payloadB64);
  const sigB64 = base64UrlEncode(sigBytes);

  const signedToken = `${payloadB64}.${sigB64}`;

  // Base URL: use request origin by default
  const url = new URL(request.url);
  const base = `${url.protocol}//${url.host}`;

  return jsonResponse(
    {
      url: `${base}/p/o.gif?t=${signedToken}`,
      token: signedToken,
      payload: payloadObj,
    },
    200,
    corsHeaders
  );
}
