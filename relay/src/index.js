// Talk relay: carries the presenter's "Next" to every phone and monitor following a talk.
// It speaks the same small part of the ntfy.sh protocol the talk pages already use:
//   POST /<topic>          publish one message (the body, at most 4 KB)
//   GET  /<topic>/sse      Server-Sent Events: every new message as data: {"event":"message","message":"..."}
//   GET  /<topic>/json     the last message as one JSON line (what a page reads when it opens)
//   POST /<topic>/vote     one phone's vote on a poll {poll, a, voter} (once per voter); GET /<topic>/vote: every poll's totals
//                          the totals also go out on the stream as  event: poll  data: {poll, c}
//   POST /<topic>/review   store one translation review from review.html (at most 100 KB); GET /<topic>/review lists them
// Each topic is one Durable Object, so all the phones of one talk share one place in memory.

const CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "*"};

export default {
  async fetch(req, env){
    if (req.method === "OPTIONS") return new Response(null, {headers: CORS});
    const m = new URL(req.url).pathname.match(/^\/([A-Za-z0-9_-]{1,64})(\/(sse|json|review|vote))?\/?$/);
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
    if (kind === "vote") {
      if (req.method === "POST") { let v; try { v = JSON.parse((await req.text()).slice(0, 2000)) } catch (e) { return new Response("Not JSON", {status: 400, headers: CORS}) }
        const poll = String(v.poll || "").slice(0, 200), a = Math.floor(+v.a), voter = String(v.voter || "").slice(0, 80);
        if (!poll || !voter || !(a >= 0 && a < 10)) return new Response("Bad vote", {status: 400, headers: CORS});
        const key = "poll:" + poll, p = (await this.state.storage.get(key)) || {c: {}, v: {}};
        if (p.v[voter] == null) { p.v[voter] = a; p.c[a] = (p.c[a] || 0) + 1; await this.state.storage.put(key, p); this.pollOut(poll, p.c) }
        return Response.json({ok: true, c: p.c, yours: p.v[voter]}, {headers: CORS}) }
      const all = await this.state.storage.list({prefix: "poll:"}), out = {}; for (const [k, p] of all) out[k.slice(5)] = p.c;
      return Response.json(out, {headers: {...CORS, "Cache-Control": "no-store"}});
    }
    if (kind === "review") {          // translation reviews wait here until the speaker accepts them in Edit (each is its own key: values are limited to 128 KB)
      if (req.method === "POST") { const body = (await req.text()).slice(0, 100000); try { JSON.parse(body) } catch (e) { return new Response("Not JSON", {status: 400, headers: CORS}) }
        await this.state.storage.put("rv:" + Date.now().toString(36).padStart(10, "0") + Math.random().toString(36).slice(2, 6), body);
        const all = await this.state.storage.list({prefix: "rv:"}); const keys = [...all.keys()]; if (keys.length > 100) await this.state.storage.delete(keys.slice(0, keys.length - 100));
        return Response.json({ok: true}, {headers: CORS}) }
      const all = await this.state.storage.list({prefix: "rv:"});
      return new Response("[" + [...all.values()].join(",") + "]", {headers: {...CORS, "Content-Type": "application/json", "Cache-Control": "no-store"}});
    }
    if (kind === "json") return new Response(this.last ? this.last + "\n" : "", {headers: {...CORS, "Content-Type": "application/x-ndjson", "Cache-Control": "no-store"}});
    if (kind === "sse") {
      const {readable, writable} = new TransformStream(), w = writable.getWriter(); this.subs.add(w);
      w.write(new TextEncoder().encode(": hello\n\nevent: ping\ndata: 1\n\n")).catch(() => this.subs.delete(w));
      if (!this.beat) this.beat = setInterval(() => { if (!this.subs.size) { clearInterval(this.beat); this.beat = null; return } this.send("event: ping\ndata: 1\n\n") }, 25000);      // a heartbeat phones can see, so they know they are still connected
      return new Response(readable, {headers: {...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-store"}});
    }
    return new Response("Not found", {status: 404, headers: CORS});
  }

  // send a poll's totals to every screen, at most twice a second (a room voting at once is one update, not hundreds)
  pollOut(poll, c){ this.pend = this.pend || {}; this.pend[poll] = c; if (this.pollT) return;
    this.pollT = setTimeout(() => { const p = this.pend; this.pend = {}; this.pollT = null; for (const k in p) this.send("event: poll\ndata: " + JSON.stringify({poll: k, c: p[k]}) + "\n\n") }, 500) }

  send(text){ const b = new TextEncoder().encode(text); for (const w of this.subs) w.write(b).catch(() => this.subs.delete(w)) }
}
