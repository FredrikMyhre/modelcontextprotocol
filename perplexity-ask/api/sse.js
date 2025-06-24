/* -----------------------------------------------------------
 *  Vercel MCP-server (single file)
 *  • Tools: search, fetch, perplexity_ask
 *  • SSE JSON-lines with `data:` prefix  (required by OpenAI UI)
 *  • HEAD / OPTIONS / GET / POST  implemented
 * ---------------------------------------------------------- */

/* ---------- Verktøydefinisjoner ---------- */
const TOOLS = [
  {
    name: "search",
    description: "Searches news and web documents. Input is a natural-language query string.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"]
    }
  },
  {
    name: "fetch",
    description: "Fetches the full text for a given document id returned by search.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"]
    }
  },
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

/* ---------- Hjelpere ---------- */
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,HEAD");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function jsonRpc(id, resultOrError) {
  return { jsonrpc: "2.0", id, ...resultOrError };
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

/* ---------- Main handler ---------- */
export default async function handler(req, res) {
  cors(res);

  /* HEAD – helse-sjekk */
  if (req.method === "HEAD") return res.status(200).end();

  /* OPTIONS – preflight */
  if (req.method === "OPTIONS") return res.status(204).end();

  /* GET  →  SSE JSON-linjer  */
  if (req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });

    /* verktøyliste som første linje (må ha data:-prefiks) */
    res.write(
      "data: " +
        JSON.stringify(jsonRpc(0, { result: { tools: TOOLS } })) +
        "\n\n"
    );

    /* ping som kommentar hvert 20 s */
    const ping = setInterval(() => res.write(":\n\n"), 20000);
    req.on("close", () => {
      clearInterval(ping);
      res.end();
    });
    return;
  }

  /* POST  →  JSON-RPC */
  if (req.method === "POST") {
    const raw = typeof req.body === "object" ? JSON.stringify(req.body) : await readBody(req);
    let body;
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    const { id, method, params } = body;

    /* tools/list */
    if (method === "tools/list") {
      return res.status(200).json(jsonRpc(id, { result: { tools: TOOLS } }));
    }

    /* tools/call */
    if (method === "tools/call") {
      const { tool, input } = params ?? {};

      /* search – dummy result */
      if (tool === "search") {
        const query = input?.query ?? "";
        return res.status(200).json(
          jsonRpc(id, {
            result: {
              output: {
                results: [
                  {
                    id: "dummy-1",
                    title: `Simulated result for “${query}”`,
                    text: "This is placeholder text.",
                    url: null
                  }
                ]
              }
            }
          })
        );
      }

      /* fetch – dummy doc */
      if (tool === "fetch") {
        return res.status(200).json(
          jsonRpc(id, {
            result: {
              output: {
                id: input?.id,
                title: "Dummy document",
                text: "Full text for the dummy document.",
                url: null,
                metadata: null
              }
            }
          })
        );
      }

      /* perplexity_ask – live web via Perplexity */
      if (tool === "perplexity_ask") {
        if (!process.env.PERPLEXITY_API_KEY) {
          return res.status(500).json(
            jsonRpc(id, { error: { code: -32000, message: "Missing PERPLEXITY_API_KEY" } })
          );
        }
        try {
          const upstream = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`
            },
            body: JSON.stringify({
              model: "sonar-pro",
              messages: input?.messages || []
            })
          });
          const data = await upstream.json();
          return res.status(200).json(jsonRpc(id, { result: { output: data } }));
        } catch (err) {
          return res.status(502).json(jsonRpc(id, { error: { code: -32099, message: String(err) } }));
        }
      }

      /* ukjent verktøy */
      return res.status(400).json(jsonRpc(id, { error: { code: -32602, message: "Unknown tool" } }));
    }

    /* ukjent metode */
    return res.status(400).json(jsonRpc(id, { error: { code: -32601, message: "Unsupported method" } }));
  }

  /* Andre metoder → 405 */
  res.status(405).end();
}
