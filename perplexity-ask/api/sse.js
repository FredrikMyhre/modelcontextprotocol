// api/sse.js  – sender JSON-RPC tools/list resultat på SSE
export default function handler(req, res) {
  /* CORS pre-flight */
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  /* SSE endpoint */
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const tools = [{
      name: "perplexity_ask",
      description: "Live web-søk via Perplexity Sonar-pro",
      input_schema: {
        type: "object",
        properties: { messages: { type: "array" } },
        required: ["messages"]
      }
    }];

    /* Send som JSON-RPC-response id = 0 */
    const payload = {
      jsonrpc: "2.0",
      id: 0,
      result: { tools }
    };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);

    /* Hold forbindelsen med ping */
    const ping = setInterval(() => res.write("event: ping\ndata: {}\n\n"), 25_000);
    req.on("close", () => { clearInterval(ping); res.end(); });
    return;
  }

  /* POST → tools/call */
  if (req.method === "POST") {
    const { tool, input } = req.body ?? {};
    if (tool !== "perplexity_ask" || !input?.messages)
      return res.status(400).json({ error: "Invalid tool/input" });
    if (!process.env.PERPLEXITY_API_KEY)
      return res.status(500).json({ error: "Missing PERPLEXITY_API_KEY" });

    fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`
      },
      body: JSON.stringify({ model: "sonar-pro", messages: input.messages })
    })
      .then(r => r.json())
      .then(data => res.status(200).json({ output: data }))
      .catch(e => res.status(500).json({ error: e?.toString?.() || "Upstream error" }));
    return;
  }

  res.status(405).end();
}
