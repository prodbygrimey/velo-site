const PIXEL_GIF_BYTES = new Uint8Array([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 33,
  249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59
]);

const PIXEL_HEADERS = {
  "content-type": "image/gif",
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  pragma: "no-cache",
  expires: "0"
};

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  context.waitUntil(trackOpen({ request, env, url }));
  return new Response(PIXEL_GIF_BYTES, { headers: PIXEL_HEADERS });
}

async function trackOpen({ request, env, url }) {
  try {
    if (!env.DB) {
      return;
    }

    const parsed = await parseIdentity(url.searchParams, env.PIXEL_SECRET || "");
    const headers = request.headers;
    const ua = truncate(headers.get("user-agent") || "", 512);
    const purpose = (headers.get("purpose") || headers.get("sec-purpose") || "").toLowerCase();
    const prefetchHint = purpose.includes("prefetch");
    const proxyHint = ua.toLowerCase().includes("googleimageproxy");
    const isPrefetch = prefetchHint || proxyHint ? 1 : 0;

    const cf = request.cf || {};
    const country = truncate(cf.country || "", 8);
    const colo = truncate(cf.colo || "", 16);
    const rayId = truncate(headers.get("cf-ray") || "", 64);
    const nowIso = new Date().toISOString();
    const ip = headers.get("cf-connecting-ip") || "";
    const ipHash = ip ? await sha256Hex(`${env.IP_HASH_SALT || "velo"}:${ip}`) : null;

    const messageId = truncate(parsed.messageId || "", 128) || null;
    const campaignId = truncate(parsed.campaignId || "", 128) || null;
    const recipientId = truncate(parsed.recipientId || "", 128) || null;
    const recipientEmail = normalizeRecipientEmail(parsed.recipientEmail || "");
    const tokenId = truncate(parsed.tokenId || url.searchParams.get("t") || "", 512) || null;

    await insertOpenEvent(env.DB, {
      messageId,
      campaignId,
      recipientId,
      recipientEmail,
      tokenId,
      nowIso,
      ua,
      ipHash,
      country,
      colo,
      rayId,
      isPrefetch
    });

    if (!messageId) {
      return;
    }

    await upsertOpenRollup(env.DB, {
      messageId,
      campaignId,
      recipientId,
      recipientEmail,
      nowIso,
      ua,
      ipHash,
      isPrefetch
    });
  } catch (err) {
    console.error("pixel track error", err);
  }
}

async function parseIdentity(params, secret) {
  const token = params.get("t");
  if (token) {
    return parseToken(token, secret);
  }

  return {
    messageId: params.get("m") || "",
    campaignId: params.get("c") || "",
    recipientId: params.get("r") || "",
    recipientEmail: params.get("re") || params.get("recipient_email") || "",
    tokenId: ""
  };
}

async function parseToken(token, secret) {
  const parts = token.split(".");
  if (parts.length === 1) {
    const decoded = parseJsonSafe(base64UrlDecode(parts[0]));
    if (!decoded) {
      throw new Error("Invalid token payload");
    }
    return {
      messageId: decoded.m || "",
      campaignId: decoded.c || "",
      recipientId: decoded.r || "",
      recipientEmail: decoded.re || decoded.recipient_email || "",
      tokenId: decoded.tid || ""
    };
  }

  if (parts.length !== 2) {
    throw new Error("Invalid token format");
  }

  const payloadPart = parts[0];
  const sigPart = parts[1];
  if (!secret) {
    throw new Error("Signed token provided but PIXEL_SECRET is not configured");
  }

  const expectedSig = await hmacSha256Base64Url(payloadPart, secret);
  if (!timingSafeEqual(expectedSig, sigPart)) {
    throw new Error("Invalid token signature");
  }

  const decoded = parseJsonSafe(base64UrlDecode(payloadPart));
  if (!decoded) {
    throw new Error("Invalid token payload");
  }

  if (decoded.exp && Date.now() > Number(decoded.exp) * 1000) {
    throw new Error("Expired token");
  }

  return {
    messageId: decoded.m || "",
    campaignId: decoded.c || "",
    recipientId: decoded.r || "",
    recipientEmail: decoded.re || decoded.recipient_email || "",
    tokenId: decoded.tid || ""
  };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256Base64Url(input, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(input));
  return base64UrlEncode(new Uint8Array(sig));
}

async function sha256Hex(input) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64UrlDecode(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLen);
  return atob(padded);
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parseJsonSafe(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function truncate(value, max) {
  return String(value).slice(0, max);
}

function normalizeRecipientEmail(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return null;
  }
  return truncate(normalized, 320);
}

async function insertOpenEvent(db, row) {
  try {
    await db.prepare(
      `INSERT INTO email_open_events
      (message_id, campaign_id, recipient_id, recipient_email, token_id, opened_at, user_agent, ip_hash, country, colo, ray_id, is_prefetch)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
    )
      .bind(
        row.messageId,
        row.campaignId,
        row.recipientId,
        row.recipientEmail,
        row.tokenId,
        row.nowIso,
        row.ua,
        row.ipHash,
        row.country,
        row.colo,
        row.rayId,
        row.isPrefetch
      )
      .run();
  } catch {
    await db.prepare(
      `INSERT INTO email_open_events
      (message_id, campaign_id, recipient_id, token_id, opened_at, user_agent, ip_hash, country, colo, ray_id, is_prefetch)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
    )
      .bind(
        row.messageId,
        row.campaignId,
        row.recipientId,
        row.tokenId,
        row.nowIso,
        row.ua,
        row.ipHash,
        row.country,
        row.colo,
        row.rayId,
        row.isPrefetch
      )
      .run();
  }
}

async function upsertOpenRollup(db, row) {
  try {
    await db.prepare(
      `INSERT INTO email_open_rollups
      (message_id, campaign_id, recipient_id, recipient_email, first_open_at, last_open_at, open_count, last_user_agent, last_ip_hash, last_is_prefetch)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, ?9)
      ON CONFLICT(message_id) DO UPDATE SET
        campaign_id = COALESCE(excluded.campaign_id, email_open_rollups.campaign_id),
        recipient_id = COALESCE(excluded.recipient_id, email_open_rollups.recipient_id),
        recipient_email = COALESCE(excluded.recipient_email, email_open_rollups.recipient_email),
        last_open_at = excluded.last_open_at,
        open_count = email_open_rollups.open_count + 1,
        last_user_agent = excluded.last_user_agent,
        last_ip_hash = excluded.last_ip_hash,
        last_is_prefetch = excluded.last_is_prefetch`
    )
      .bind(
        row.messageId,
        row.campaignId,
        row.recipientId,
        row.recipientEmail,
        row.nowIso,
        row.nowIso,
        row.ua,
        row.ipHash,
        row.isPrefetch
      )
      .run();
  } catch {
    await db.prepare(
      `INSERT INTO email_open_rollups
      (message_id, campaign_id, recipient_id, first_open_at, last_open_at, open_count, last_user_agent, last_ip_hash, last_is_prefetch)
      VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?8)
      ON CONFLICT(message_id) DO UPDATE SET
        campaign_id = COALESCE(excluded.campaign_id, email_open_rollups.campaign_id),
        recipient_id = COALESCE(excluded.recipient_id, email_open_rollups.recipient_id),
        last_open_at = excluded.last_open_at,
        open_count = email_open_rollups.open_count + 1,
        last_user_agent = excluded.last_user_agent,
        last_ip_hash = excluded.last_ip_hash,
        last_is_prefetch = excluded.last_is_prefetch`
    )
      .bind(
        row.messageId,
        row.campaignId,
        row.recipientId,
        row.nowIso,
        row.nowIso,
        row.ua,
        row.ipHash,
        row.isPrefetch
      )
      .run();
  }
}
