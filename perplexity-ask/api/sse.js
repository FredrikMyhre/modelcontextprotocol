// api/sse.js  — full MCP minimal‐server (SSE + POST)
import { TextDecoder } from "util";

const TOOLS_LIST = [
  {
    name: "perplexity_ask",
    description: "Live web-søk via Perplexity Sonar-pro",
    input_schema: {
      type: "object",
      properties: { messages: { type: "array" } },
      required: ["messages"]
    }
  }
];

/* ---------------- OPTIONS (CORS) ---------------- */
export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  /* ---------------- GET  →  SSE ---------------- */
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Ping hvert 25 s
    const ping = setInterval(() => res.write("event: ping\ndata: {}\n\n"), 25_000);
    req.on("close", () => { clearInterval(ping); res.end(); });

    // Buffer innkommende bytes → linjer
    let buffer = "";
    req.on("data", chunk => {
      buffer += new TextDecoder().decode(chunk);
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.method === "tools/list") {
            const payload = {
              jsonrpc: "2.0",
              id: msg.id,
              result: { tools: TOOLS_LIST }
            };
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
          }
        } catch { /* ignore parse errors */ }
      }
    });
    return;
  }

  /* ---------------- POST  →  tools/call ---------------- */
  if (req.method === "POST") {
    const body = req.body || {};
    const { tool, input } =
      body.method === "tools/call" ? body.params ?? {} : body; // JSON-RPC eller enkel

    if (tool !== "perplexity_ask" || !input?.messages) {
      return res.status(400).json({ error: "Invalid tool/input" });
    }
    if (!process.env.PERPLEXITY_API_KEY) {
      return res.status(500).json({ error: "Missing PERPLEXITY_API_KEY" });
    }

    try {
      const r = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`
        },
        body: JSON.stringify({ model: "sonar-pro", messages: input.messages })
      });
      const data = await r.json();
      const out =
        body.method === "tools/call"
          ? { jsonrpc: "2.0", id: body.id, result: { output: data } }
          : { output: data };
      return res.status(200).json(out);
    } catch (e) {
      return res.status(500).json({ error: e?.toString?.() || "Upstream error" });
    }
  }

  res.status(405).end();
}
