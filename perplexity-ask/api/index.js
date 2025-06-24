// api/index.js  (én eneste fil)

export default async function handler(req, res) {
  const { id, method, params } = req.body ?? {};

  /* ---------- 1. tools/list ---------- */
  if (method === "tools/list") {
    return res.status(200).json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "perplexity_ask",
            description: "Live web-søk via Perplexity Sonar API",
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
        ]
      }
    });
  }

  /* ---------- 2. tools/call ---------- */
  if (method === "tools/call") {
    const { tool, input } = params ?? {};

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
          model: "sonar-medium-online",
          messages: input.messages
        })
      });

      const data = await apiRes.json();
      return res.status(200).json({
        jsonrpc: "2.0",
        id,
        result: { output: data }
      });
    } catch (err) {
      return res
        .status(500)
        .json({ error: err?.toString?.() || "Upstream error" });
    }
  }

  /* ---------- 3. ukjent metode ---------- */
  res.status(400).json({ error: "Unsupported method" });
}
