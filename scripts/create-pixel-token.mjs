import crypto from "node:crypto";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function usage() {
  console.log(
    [
      "Usage:",
      "  node scripts/create-pixel-token.mjs --message m_123 --campaign c_12 --recipient r_9 --recipient-email you@company.com [--days 45] [--base https://yourdomain.com]",
      "",
      "Required:",
      "  PIXEL_SECRET env var must be set.",
      "  --message is required."
    ].join("\n")
  );
}

const args = parseArgs(process.argv.slice(2));
const secret = process.env.PIXEL_SECRET;
const messageId = args.message || args.m;

if (!secret || !messageId) {
  usage();
  process.exit(1);
}

const nowSec = Math.floor(Date.now() / 1000);
const days = Number(args.days || "45");
const exp = nowSec + Math.floor(days * 86400);

const payload = {
  m: messageId,
  c: args.campaign || args.c || "",
  r: args.recipient || args.r || "",
  re: args["recipient-email"] || args.recipient_email || "",
  tid: args.tokenId || args.tid || crypto.randomUUID(),
  iat: nowSec,
  exp
};

const payloadPart = b64url(JSON.stringify(payload));
const sigPart = crypto.createHmac("sha256", secret).update(payloadPart).digest("base64url");
const token = `${payloadPart}.${sigPart}`;

const base = (args.base || "").replace(/\/$/, "");
if (base) {
  const pixelUrl = `${base}/p/o.gif?t=${encodeURIComponent(token)}`;
  console.log(pixelUrl);
} else {
  console.log(token);
}
