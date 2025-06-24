// api/sse.js – fungerer med ChatGPT-connector
export default async function handler(req, res) {
  /* ---------- CORS pre-flight ---------- */
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  /* ---------- Felles CORS-header ---------- */
  res.setHeader("Access-Control-Allow-Origin", "*");

  /* ---------- GET  →  SSE ---------- */
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-store");      // <- viktig
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // 1) send “ready”-event som OpenAI forventer
    res.write("event: ready\ndata: {}\n\n");

    // 2) send tools-listen som JSON-RPC-resultat id:0
    const tools = [{
      name: "perplexity_ask",
      description: "Live web-søk via Perplexity Sonar-pro",
      input_schema: {
        type: "object",
        properties: { messages: { type: "array" } },
        required: ["messages"]
      }
    }];
    const payload = { jsonrpc: "2.0", id: 0, result: { tools } };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);

    // 3) hold strømmen i live
    const ping = setInterval(() => res.write("event: ping\ndata: {}\n\n"), 25_000);
    req.on("close", () => { clearInterval(ping); res.end(); });
    return;
  }

  /* ---------- POST  →  tools/call ---------- */
  if (req.method === "POST") {
    const { tool, input } = req.body ?? {};
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
      return res.status(200).json({ output: data });
    } catch (e) {
      return res.status(500).json({ error: e?.toString?.() || "Upstream error" });
    }
  }

  res.status(405).end();
}
