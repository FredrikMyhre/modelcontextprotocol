import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  Tool,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const PERPLEXITY_ASK_TOOL: Tool = {
  name: "perplexity_ask",
  description:
    "Engages in a conversation using the Sonar API. " +
    "Accepts an array of messages (each with a role and content) " +
    "and returns a chat completion response from the Perplexity model.",
  inputSchema: {
    type: "object",
    properties: {
      messages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: { type: "string", description: "user | assistant | system" },
            content: { type: "string", description: "Text content of message" },
          },
          required: ["role", "content"],
        },
      },
    },
    required: ["messages"],
  },
};

const server = new Server({
  transport: new StdioServerTransport(),
  tools: [PERPLEXITY_ASK_TOOL],
  async call({ tool, input }) {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify({
        model: "sonar-medium-online",
        messages: input.messages,
      }),
    });

    const result = await response.json();
    return {
      tool_call_id: tool.name,
      output: result,
    };
  },
});

server.listen();
