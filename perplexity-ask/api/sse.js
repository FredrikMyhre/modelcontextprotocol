// api/sse.js
export default async function handler(req, res) {
  /* ---------- GET  ⇒  SSE stream ---------- */
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const tools = [
      {
        name: "perplexity_ask",
        description: "Live web-søk via Perplexity Sonar-pro",
        input_schema: {
          type: "object",
          properties: {
            messages: { type: "array" }
          },
          required: ["messages"]
        }
      }
    ];
    res.write(`event: tools\ndata: ${JSON.stringify({ tools })}\n\n`);
    const ping = setInterval(() => res.write("event: ping\ndata: {}\n\n"), 25_000);
    req.on("close", () => { clearInterval(ping); res.end(); });
    return;
  }

  /* ---------- POST  ⇒  tools/call ---------- */
  if (req.method === "POST") {
    const body = req.body;

    // 1) Håndter JSON-RPC fra ChatGPT-connector
    if (body?.method === "tools/call") {
      const { tool, input } = body.params ?? {};
      return callPerplexity(tool, input, res, body.id);
    }

    // 2) Håndter enkel { tool, input }  (terminal-testen)
    if (body?.tool && body?.input) {
      return callPerplexity(body.tool, body.input, res);
    }

    return res.status(400).json({ error: "Bad request" });
  }

  res.status(405).end();
}

/* ----- felles funksjon som kaller Perplexity ----- */
async function callPerplexity(tool, input, res, rpcId = null) {
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

    const payload = rpcId === null
      ? { output: data }                       // enkel format
      : { jsonrpc: "2.0", id: rpcId, result: { output: data } }; // JSON-RPC

    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: e?.toString?.() || "Upstream error" });
  }
}
