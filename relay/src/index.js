// Talk relay: carries the presenter's "Next" to every phone and monitor following a talk.
// It speaks the same small part of the ntfy.sh protocol the talk pages already use:
//   POST /<topic>          publish one message (the body, at most 4 KB)
//   GET  /<topic>/sse      Server-Sent Events: every new message as data: {"event":"message","message":"..."}
//   GET  /<topic>/json     the last message as one JSON line (what a page reads when it opens)
// Each topic is one Durable Object, so all the phones of one talk share one place in memory.

const CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "*"};

export default {
  async fetch(req, env){
    if (req.method === "OPTIONS") return new Response(null, {headers: CORS});
    const m = new URL(req.url).pathname.match(/^\/([A-Za-z0-9_-]{1,64})(\/(sse|json))?\/?$/);
    if (!m) return new Response("Talk relay", {headers: CORS});
    return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(req);
  }
};

export class Room {
  constructor(state){ this.state = state; this.subs = new Set(); this.last = null; this.beat = null }

  async fetch(req){
    const url = new URL(req.url), kind = url.pathname.split("/")[2] || "";
    if (this.last === null) this.last = (await this.state.storage.get("last")) || "";
    if (req.method === "POST" && !kind) {
      const body = (await req.text()).slice(0, 4096), msg = {id: Date.now().toString(36), time: Math.floor(Date.now() / 1000), event: "message", message: body};
      this.last = JSON.stringify(msg); await this.state.storage.put("last", this.last);
      this.send("data: " + this.last + "\n\n");
      return Response.json({ok: true, followers: this.subs.size}, {headers: CORS});
    }
    if (kind === "json") return new Response(this.last ? this.last + "\n" : "", {headers: {...CORS, "Content-Type": "application/x-ndjson", "Cache-Control": "no-store"}});
    if (kind === "sse") {
      const {readable, writable} = new TransformStream(), w = writable.getWriter(); this.subs.add(w);
      w.write(new TextEncoder().encode(": hello\n\n")).catch(() => this.subs.delete(w));
      if (!this.beat) this.beat = setInterval(() => { if (!this.subs.size) { clearInterval(this.beat); this.beat = null; return } this.send(": keepalive\n\n") }, 25000);
      return new Response(readable, {headers: {...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-store"}});
    }
    return new Response("Not found", {status: 404, headers: CORS});
  }

  send(text){ const b = new TextEncoder().encode(text); for (const w of this.subs) w.write(b).catch(() => this.subs.delete(w)) }
}
