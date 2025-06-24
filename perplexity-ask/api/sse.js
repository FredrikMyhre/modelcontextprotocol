// api/sse.js
// ÉN fil som oppfyller ChatGPT-connectorens krav:
// • OPTIONS  – CORS-pre-flight svar (204)
// • GET      – SSE-strøm med tools-liste + ping
// • POST     – tools/call  (både enkel {tool,input} og JSON-RPC)

export default async function handler(req, res) {
  /* ---------- 0. OPTIONS (CORS pre-flight) ---------- */
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();              // tomt svar
  }

  /* ---------- Felles CORS-header for GET/POST ---------- */
  res.setHeader("Access-Control-Allow-Origin", "*");

  /* ---------- 1. GET  →  SSE-stream ---------- */
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();                        // send headerene straks

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

    // send tools-liste som første event
    res.write(`event: tools\ndata: ${JSON.stringify({ tools })}\n\n`);

    // hold forbindelsen i live med ping hvert 25s
    const ping = setInterval(() => res.write("event: ping\ndata: {}\n\n"), 25_000);
    req.on("close", () => { clearInterval(ping); res.end(); });
    return;
  }

  /* ---------- 2. POST  →  tools/call ---------- */
  if (req.method === "POST") {
    const body = req.body;

    // 2a) JSON-RPC-format (ChatGPT-connector)
    if (body?.method === "tools/call") {
      const { tool, input } = body.params ?? {};
      return callPerplexity(tool, input, res, body.id);
    }

    // 2b) Enkel { tool, input }  (curl / egen kode)
    if (body?.tool && body?.input) {
      return callPerplexity(body.tool, body.input, res);
    }

    return res.status(400).json({ error: "Bad request" });
  }

  /* ---------- 3. Andre metoder ---------- */
  res.status(405).end();
}

/* ===== Felles funksjon som kaller Perplexity Sonar-pro ===== */
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
      ? { output: data }                                 // enkel format
      : { jsonrpc: "2.0", id: rpcId, result: { output: data } }; // JSON-RPC

    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ error: err?.toString?.() || "Upstream error" });
  }
}
