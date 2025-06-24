/**
 * Minimal MCP-endepunkt for Vercel.
 * Støtter HEAD, OPTIONS, GET (SSE), POST (JSON-RPC).
 * Krever env PERPLEXITY_API_KEY.
 */

const TOOLS = [
  {
    name: "perplexity_ask",
    description: "Live web-søk via Perplexity Sonar-pro",
    input_schema: {
      type: "object",
      properties: {
        messages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              role: { type: "string" },
              content: { type: "string" }
            },
            required: ["role", "content"]
          }
        }
      },
      required: ["messages"]
    }
  }
];

export default async function handler(req, res) {
  /* ---------- felles CORS ---------- */
  const allow = () => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,OPTIONS,HEAD"
    );
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  };

  /* ---------- HEAD ---------- */
  if (req.method === "HEAD") {
    allow();
    return res.status(200).end();
  }

  /* ---------- OPTIONS (pre-flight) ---------- */
  if (req.method === "OPTIONS") {
    allow();
    return res.status(204).end();
  }

  /* ---------- GET → SSE-stream ---------- */
  if (req.method === "GET") {
    allow();
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });

    /* Ready-signal (mange klienter forventer dette) */
    res.write("event: ready\n");
    res.write("data: {}\n\n");

    /* Send tools-listen som JSON-RPC result */
    res.write(
      "data: " +
        JSON.stringify({
          jsonrpc: "2.0",
          id: 0,
          result: { tools: TOOLS }
        }) +
        "\n\n"
    );

    /* Hold linja varm med ping */
    const ping = setInterval(() => {
      res.write("event: ping\ndata: {}\n\n");
    }, 15000);

    req.on("close", () => clearInterval(ping));
    return;
  }

  /* ---------- POST → JSON-RPC ---------- */
  if (req.method === "POST") {
    allow();

    const raw = await readBody(req);
    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    // Støtter både enkel-objekt og SSE-batch med ett objekt
    const { jsonrpc, id, method, params } = parsed;

    /* ---------- tools/list ---------- */
    if (method === "tools/list") {
      return res.status(200).json({
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS }
      });
    }

    /* ---------- tools/call ---------- */
    if (method === "tools/call") {
      const { tool, input } = params ?? {};
      if (tool !== "perplexity_ask" || !input?.messages) {
        return res.status(400).json({
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Invalid tool or input" }
        });
      }
      if (!process.env.PERPLEXITY_API_KEY) {
        return res.status(500).json({
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: "Missing PERPLEXITY_API_KEY" }
        });
      }

      try {
        const upstream = await fetch(
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

        const data = await upstream.json();
        return res.status(200).json({
          jsonrpc: "2.0",
          id,
          result: { output: data }
        });
      } catch (err) {
        return res.status(502).json({
          jsonrpc: "2.0",
          id,
          error: { code: -32099, message: String(err) }
        });
      }
    }

    /* ---------- unsupported ---------- */
    return res.status(400).json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Unsupported method" }
    });
  }

  /* ---------- fallback ---------- */
  res.status(405).end();
}

/* ---------- utils ---------- */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
