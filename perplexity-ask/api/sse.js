// api/sse.js
export default async function handler(req, res) {
  /* ---------- 1. SSE (GET) ---------- */
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // send verktøy-listen én gang
    const tools = [
      {
        name: "perplexity_ask",
        description: "Live web-søk via Perplexity Sonar-pro",
        input_schema: { type: "object", properties: { messages: { type: "array" } }, required: ["messages"] }
      }
    ];
    res.write(`event: tools\ndata: ${JSON.stringify({ tools })}\n\n`);

    // enkel ping hvert 25. sekund
    const ping = setInterval(() => res.write("event: ping\ndata: {}\n\n"), 25_000);
    req.on("close", () => { clearInterval(ping); res.end(); });
    return;
  }

  /* ---------- 2. tools/call (POST) ---------- */
  if (req.method === "POST") {
    const { tool, input } = req.body ?? {};
    if (tool !== "perplexity_ask" || !input?.messages) {
      return res.status(400).json({ error: "Invalid tool or input" });
    }
    if (!process.env.PERPLEXITY_API_KEY) {
      return res.status(500).json({ error: "Missing PERPLEXITY_API_KEY" });
    }

    try {
      const apiRes = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`
        },
        body: JSON.stringify({
          model: "sonar-pro",
          messages: input.messages
        })
      });
      const data = await apiRes.json();
      return res.status(200).json({ output: data });
    } catch (e) {
      return res.status(500).json({ error: e?.toString?.() || "Upstream error" });
    }
  }

  /* ---------- 3. alt annet ---------- */
  res.status(405).end();
}
