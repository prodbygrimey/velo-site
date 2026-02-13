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

export async function onRequest({ request }) {
  const origin = request.headers.get("origin") || "*";

  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, 405, origin);
    }

    return jsonResponse(
      {
        status: "ok",
        service: "velo-tracking",
        time: new Date().toISOString(),
      },
      200,
      origin
    );
  } catch {
    return jsonResponse({ error: "internal_error" }, 500, origin);
  }
}
