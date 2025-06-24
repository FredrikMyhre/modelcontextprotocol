export default async function handler(req, res) {
  // HEAD = ChatGPT MCP validator sjekker om endepunktet lever
  if (req.method === "HEAD") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).end();
  }

  // OPTIONS = preflight CORS-sjekk
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,HEAD");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  // CORS for alle andre metoder
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });

    res.write("event: ready\n");
    res.write("data: {}\n\n");

    res.write("data: " + JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      result: {
        tools: [
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
        ]
      }
    }) + "\n\n");

    const ping = setInterval(() => {
      res.write("event: ping\n");
      res.write("data: {}\n\n");
    }, 2000);

    req.on("close", () => clearInterval(ping));
    return;
  }

  if (req.method === "POST") {
    try {
      const { jsonrpc, id, method, params } = req.body ?? {};

      if (method !== "tools/call") {
        return res.status(400).json({ error: "Invalid method" });
      }

      const { tool, input } = params ?? {};
      if (tool !== "perplexity_ask" || !input?.messages) {
        return res.status(400).json({ error: "Invalid tool/input" });
      }

      if (!process.env.PERPLEXITY_API_KEY) {
        return res.status(500).json({ error: "Missing PERPLEXITY_API_KEY" });
      }

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
      return res.status(200).json({
        jsonrpc: "2.0",
        id,
        result: { output: data }
      });
    } catch (err) {
      return res.status(500).json({ error: err?.toString?.() || "Upstream error" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
