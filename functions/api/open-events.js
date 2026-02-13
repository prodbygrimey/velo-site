function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin || "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  };
}

function jsonResponse(data, status = 200, origin = "*", extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(origin),
      ...extraHeaders,
    },
  });
}

function unauthorized(origin) {
  return jsonResponse({ error: "unauthorized" }, 401, origin, { "www-authenticate": "Bearer" });
}

function parseLimit(value) {
  if (value == null || value === "") return 100;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.min(parsed, 500);
}

function parseCursor(value) {
  if (value == null || value === "") return 0;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export async function onRequest({ request, env }) {
  const origin = request.headers.get("origin") || "*";

  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, 405, origin);
    }

    const expected = env.PIXEL_API_TOKEN;
    if (!expected) {
      return jsonResponse({ error: "server_not_configured" }, 500, origin);
    }

    const auth = request.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return unauthorized(origin);
    }

    const token = auth.slice("Bearer ".length).trim();
    if (token !== expected) {
      return unauthorized(origin);
    }

    if (!env.DB) {
      return jsonResponse({ error: "missing_DB_binding" }, 500, origin);
    }

    const url = new URL(request.url);
    const campaignId = (url.searchParams.get("campaign_id") || "").trim();
    const messageId = (url.searchParams.get("message_id") || "").trim();
    const recipientEmail = (url.searchParams.get("recipient_email") || "").trim().toLowerCase();

    const limit = parseLimit(url.searchParams.get("limit"));
    if (limit == null) {
      return jsonResponse({ error: "invalid_limit" }, 400, origin);
    }

    const offset = parseCursor(url.searchParams.get("cursor"));
    if (offset == null) {
      return jsonResponse({ error: "invalid_cursor" }, 400, origin);
    }

    const whereClauses = [];
    const bindValues = [];
    let index = 1;

    if (campaignId) {
      whereClauses.push(`campaign_id = ?${index}`);
      bindValues.push(campaignId);
      index += 1;
    }
    if (messageId) {
      whereClauses.push(`message_id = ?${index}`);
      bindValues.push(messageId);
      index += 1;
    }
    if (recipientEmail) {
      whereClauses.push(`LOWER(recipient_email) = ?${index}`);
      bindValues.push(recipientEmail);
      index += 1;
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const limitPlaceholder = `?${index}`;
    bindValues.push(limit + 1);
    index += 1;
    const offsetPlaceholder = `?${index}`;
    bindValues.push(offset);

    const sql = `
      SELECT
        message_id,
        campaign_id,
        recipient_id,
        recipient_email,
        token_id,
        opened_at,
        user_agent,
        ip_hash,
        country,
        colo,
        ray_id,
        is_prefetch
      FROM email_open_events
      ${whereSql}
      ORDER BY opened_at DESC, token_id DESC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;

    const result = await env.DB.prepare(sql).bind(...bindValues).all();
    const rows = Array.isArray(result.results) ? result.results : [];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? String(offset + limit) : null;

    const events = pageRows.map((row) => ({
      message_id: row.message_id ?? null,
      campaign_id: row.campaign_id ?? null,
      recipient_id: row.recipient_id ?? null,
      recipient_email: row.recipient_email ?? null,
      token_id: row.token_id ?? null,
      opened_at: row.opened_at ?? null,
      user_agent: row.user_agent ?? null,
      ip_hash: row.ip_hash ?? null,
      country: row.country ?? null,
      colo: row.colo ?? null,
      ray_id: row.ray_id ?? null,
      is_prefetch: row.is_prefetch ?? 0,
    }));

    return jsonResponse(
      {
        events,
        next_cursor: nextCursor,
      },
      200,
      origin
    );
  } catch (err) {
    console.error("open-events error", err);
    return jsonResponse({ error: "internal_error" }, 500, origin);
  }
}
