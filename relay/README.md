# Talk relay (Cloudflare Worker)

Carries the presenter's "Next" to every phone and monitor following a talk. It speaks the same small part of the ntfy.sh protocol the talk pages use (POST /topic, GET /topic/sse, GET /topic/json), so switching is one line: `relay:` in `talks/common/config.js`.

Deploy: Cloudflare dashboard → Workers & Pages → Create → Import a repository → this repo, root directory `relay`. Or locally: `cd relay && npx wrangler deploy`.
