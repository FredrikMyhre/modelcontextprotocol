// api/sse.js
export default async function handler(req, res) {
  // === 1) svarer med SSE-header ===
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();         // send headerene umiddelbart

  // === 2) send tools-listen én gang ===
  const tools = [
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

  const payload = JSON.stringify({ tools });
  res.write(`event: tools\ndata: ${payload}\n\n`);

  // === 3) hold forbindelsen åpen så lenge ChatGPT ønsker ===
  req.on("close", () => res.end());
}
