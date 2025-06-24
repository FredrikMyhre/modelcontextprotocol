// api/sse.js
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { VercelSseTransport } from "@modelcontextprotocol/sdk/server/vercel-sse";

/* definer (det samme) verktøyet */
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
              role:    { type: "string" },
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

/* MCP-server med SSE-transport */
const server = new Server({
  transport: new VercelSseTransport(),
  tools,
  async call({ input }) {
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
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
    const data = await r.json();
    return { output: data };
  }
});

/* Export default for Vercel */
export default function handler(req, res) {
  server.handle(req, res);
}
