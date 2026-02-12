# Tracking Pixel Setup (Cloudflare Pages + D1)

This project now includes a hosted tracking pixel endpoint at:

- `GET /p/o.gif`

The endpoint always returns a 1x1 transparent GIF and logs open events into D1.

## 1) Create D1 tables

Run `db/email_tracking.sql` against your D1 database.

If you use Wrangler locally:

```bash
npx wrangler d1 execute <YOUR_DB_NAME> --file=./db/email_tracking.sql
```

## 2) Bind D1 + secrets in Cloudflare Pages

In Cloudflare Pages project settings, add:

- D1 binding:
  - `DB` -> your D1 database
- Environment variables:
  - `PIXEL_SECRET` = long random secret (used to verify signed tokens)
  - `IP_HASH_SALT` = random salt string (optional but recommended)

## 3) Generate per-email token

Use the script in this repo:

```bash
$env:PIXEL_SECRET="your-secret"
node scripts/create-pixel-token.mjs --message msg_123 --campaign camp_1 --recipient rec_9 --base https://yourdomain.com
node scripts/create-pixel-token.mjs --message msg_123 --campaign camp_1 --recipient rec_9 --recipient-email juan@company.com --base https://yourdomain.com
```

This prints a full pixel URL, e.g.:

`https://yourdomain.com/p/o.gif?t=<SIGNED_TOKEN>`

## 4) Embed in outbound email HTML

```html
<img
  src="https://yourdomain.com/p/o.gif?t=<SIGNED_TOKEN>"
  width="1"
  height="1"
  style="display:block;width:1px;height:1px;opacity:0;"
  alt=""
/>
```

Use one unique token per sent message.

## 5) Query open data

- Raw events: `email_open_events`
- Per-message summary: `email_open_rollups`

Example query:

```sql
SELECT campaign_id, COUNT(*) AS messages, SUM(open_count) AS opens
FROM email_open_rollups
GROUP BY campaign_id;
```

## Notes

- Open tracking is approximate. Mail Privacy Protection and proxy fetchers can inflate opens.
- `is_prefetch` is a heuristic flag for likely prefetch/proxy opens.
- The endpoint returns the pixel even when tracking fails, so email rendering is unaffected.
