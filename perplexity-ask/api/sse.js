/* ---------- Tool‑definitions ---------- */
const TOOLS = [
  {
    name: "search",
    description: "Searches news and web documents.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"]
    },
    output_schema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              text: { type: "string" },
              url: { type: ["string", "null"] }
            },
            required: ["id", "title", "text"]
          }
        }
      },
      required: ["results"]
    }
  },
  {
    name: "fetch",
    description: "Fetches full text for a given document id returned by search.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"]
    },
    output_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        text: { type: "string" },
        url: { type: ["string", "null"] },
        metadata: { type: ["object", "null"] }
      },
      required: ["id", "title", "text"]
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

/* ---------- Helpers ---------- */
const cors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,HEAD");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};
const jsonRpc = (id, payload) => ({ jsonrpc: "2.0", id, ...payload });
const readRaw = (req) =>
  new Promise((r) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => r(d));
  });

/* ---------- Main handler ---------- */
export default async function handler(req, res) {
  cors(res);
  if (req.method === "HEAD") return res.status(200).end();
  if (req.method === "OPTIONS") return res.status(204).end();

  /* ---------- GET → SSE ---------- */
  if (req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    res.write("data: " + JSON.stringify(jsonRpc(0, { result: { tools: TOOLS } })) + "\n\n");
    const ping = setInterval(() => res.write(":\n\n"), 20000);
    req.on("close", () => { clearInterval(ping); res.end(); });
    return;
  }

  /* ---------- POST → JSON‑RPC ---------- */
  if (req.method === "POST") {
    let body = req.body;
    if (!body || typeof body !== "object") {
      try { body = JSON.parse(await readRaw(req)); } catch { body = {}; }
    }
    const { id, method, params } = body;

    if (method === "tools/list") {
      return res.status(200).json(jsonRpc(id, { result: { tools: TOOLS } }));
    }

    if (method === "tools/call") {
      const { tool, input } = params ?? {};

      /* search */
      if (tool === "search") {
        const q = input?.query || "";
        return res.status(200).json(
          jsonRpc(id, {
            result: {
              results: [
                {
                  id: "dummy-1",
                  title: `Simulated result for "${q}"`,
                  text: "This is placeholder text.",
                  url: null
                }
              ]
            }
          })
        );
      }

      /* fetch */
      if (tool === "fetch") {
        return res.status(200).json(
          jsonRpc(id, {
            result: {
              id: input?.id,
              title: "Dummy document",
              text: "Full text for the dummy document.",
              url: null,
              metadata: null
            }
          })
        );
      }

      /* perplexity_ask */
      if (tool === "perplexity_ask") {
        if (!process.env.PERPLEXITY_API_KEY)
          return res.status(500).json(jsonRpc(id, { error: { code: -32000, message: "Missing PERPLEXITY_API_KEY" } }));
        const up = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`
          },
          body: JSON.stringify({ model: "sonar-pro", messages: input.messages })
        });
        const data = await up.json();
        return res.status(200).json(jsonRpc(id, { result: data }));
      }

      return res.status(400).json(jsonRpc(id, { error: { code: -32602, message: "Unknown tool" } }));
    }

    return res.status(400).json(jsonRpc(id, { error: { code: -32601, message: "Unsupported method" } }));
  }

  res.status(405).end();
}
