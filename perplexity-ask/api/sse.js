/* -----------------------------------------------------------
 *  MCP remote server – single file for Vercel
 *  • HEAD / OPTIONS / GET (SSE JSON-lines) / POST (JSON-RPC)
 *  • Tools: search, fetch (required by ChatGPT Deep Research)
 *  • Extra tool: perplexity_ask  (live web-søk via Perplexity)
 * ---------------------------------------------------------- */

const TOOLS = [
  {
    name: "search",
    description:
      "Searches news and web documents. Input is a natural-language query string.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"]
    }
  },
  {
    name: "fetch",
    description:
      "Fetches the full text for a given document id returned by search.",
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
      properties: {
        messages: { type: "array" }
      },
      required: ["messages"]
    }
  }
];

/* ---------- Helper ---------- */
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS,HEAD"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function jsonLine(obj) {
  return JSON.stringify(obj) + "\n\n";
}

/* ---------- Main handler ---------- */
export default async function handler(req, res) {
  /* HEAD / OPTIONS */
  cors(res);
  if (req.method === "HEAD") return res.status(200).end();
  if (req.method === "OPTIONS") return res.status(204).end();

  /* GET  →  SSE JSON-lines */
  if (req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    // send verktøyliste som første linje
    res.write(
      jsonLine({ jsonrpc: "2.0", id: 0, result: { tools: TOOLS } })
    );
    // ping hvert 20 s
    const ping = setInterval(() => res.write(":\n\n"), 20000);
    req.on("close", () => {
      clearInterval(ping);
      res.end();
    });
    return;
  }

  /* POST  →  JSON-RPC */
  if (req.method === "POST") {
    let body = req.body;
    if (!body || typeof body !== "object") {
      body = await new Promise((resolve) => {
        let data = "";
        req.on("data", (c) => (data += c));
        req.on("end", () => resolve(JSON.parse(data || "{}")));
      });
    }

    const { id, method, params } = body;

    /* ---------- tools/list ---------- */
    if (method === "tools/list") {
      return res
        .status(200)
        .json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    }

    /* ---------- tools/call ---------- */
    if (method === "tools/call") {
      const { tool, input } = params ?? {};

      /* search – dummy result */
      if (tool === "search") {
        const q = input?.query || "";
        return res.status(200).json({
          jsonrpc: "2.0",
          id,
          result: {
            output: {
              results: [
                {
                  id: "dummy-1",
                  title: `Simulated result for “${q}”`,
                  text: "This is placeholder text.",
                  url: null
                }
              ]
            }
          }
        });
      }

      /* fetch – dummy text */
      if (tool === "fetch") {
        return res.status(200).json({
          jsonrpc: "2.0",
          id,
          result: {
            output: {
              id: input?.id,
              title: "Dummy document",
              text: "Full text for the dummy document.",
              url: null,
              metadata: null
            }
          }
        });
      }

      /* perplexity_ask – live web via Perplexity */
      if (tool === "perplexity_ask") {
        if (!process.env.PERPLEXITY_API_KEY) {
          return res.status(500).json({
            jsonrpc: "2.0",
            id,
            error: { code: -32000, message: "Missing PERPLEXITY_API_KEY" }
          });
        }
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
              messages: input?.messages || []
            })
          }
        );
        const data = await upstream.json();
        return res.status(200).json({
          jsonrpc: "2.0",
          id,
          result: { output: data }
        });
      }

      /* ukjent verktøy */
      return res.status(400).json({
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: "Unknown tool" }
      });
    }

    /* ukjent metode */
    return res.status(400).json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Unsupported method" }
    });
  }

  /* Andre metoder */
  res.status(405).end();
}
