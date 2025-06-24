const TOOLS_JSON = JSON.stringify({
  jsonrpc: "2.0",
  id: 0,
  result: {
    tools: [
      {
        name: "perplexity_ask",
        description: "Live web-søk via Perplexity Sonar-pro",
        input_schema: {
          type: "object",
          properties: { messages: { type: "array" } },
          required: ["messages"]
        }
      }
    ]
  }
});

export default async function handler(req, res) {
  /* CORS + HEAD/OPTIONS */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS,HEAD"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "HEAD") return res.status(200).end();
  if (req.method === "OPTIONS") return res.status(204).end();

  /* ---------- GET → JSON-line SSE ---------- */
  if (req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });

    // 1) send verktøylisten som ren JSON-linje
    res.write(TOOLS_JSON + "\n\n");

    // 2) send ping som kommentar hvert 20. sekund
    const ping = setInterval(() => res.write(":\n\n"), 20000);
    req.on("close", () => { clearInterval(ping); res.end(); });
    return;
  }

  /* ---------- POST → tools/call ---------- */
  if (req.method === "POST") {
    const { tool, input } = req.body ?? {};
    if (tool !== "perplexity_ask" || !input?.messages)
      return res.status(400).json({ error: "Invalid tool/input" });

    if (!process.env.PERPLEXITY_API_KEY)
      return res.status(500).json({ error: "Missing PERPLEXITY_API_KEY" });

    try {
      const r = await fetch(
        "https://api.perplexity.ai/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`
          },
          body: JSON.stringify({
            model: "sonar-pro",
            messages: input.messages
          })
        }
      );
      const data = await r.json();
      return res.status(200).json({ output: data });
    } catch (e) {
      return res.status(502).json({ error: String(e) });
    }
  }

  res.status(405).end();
}
