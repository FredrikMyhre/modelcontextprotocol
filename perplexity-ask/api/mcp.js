// api/mcp.js
import { z } from "zod";
import { createMcpHandler } from "@vercel/mcp-adapter";

export const config = { runtime: "edge" }; // Fluid compute

const handler = createMcpHandler(
  /* 1. Definer verktøyene */
  (server) => {
    // ----- search -----
    server.tool(
      "search",
      "Searches news and web documents",
      { query: z.string() },
      async ({ query }) => ({
        results: [
          {
            id: "dummy-1",
            title: `Simulated hit: “${query}”`,
            text: "Placeholder text",
            url: null
          }
        ]
      })
    );

    // ----- fetch -----
    server.tool(
      "fetch",
      "Fetch full text for a given id",
      { id: z.string() },
      async ({ id }) => ({
        id,
        title: "Dummy doc",
        text: "Full text of dummy doc.",
        url: null,
        metadata: null
      })
    );

    // ----- perplexity_ask -----
    server.tool(
      "perplexity_ask",
      "Live web-søk via Perplexity Sonar-pro",
      {
        messages: z
          .array(
            z.object({ role: z.string(), content: z.string() })
          )
          .min(1)
      },
      async ({ messages }) => {
        const r = await fetch(
          "https://api.perplexity.ai/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`
            },
            body: JSON.stringify({
              model: "sonar-pro",
              messages
            })
          }
        );
        const data = await r.json();
        // Pakker Perplexity-svar som én tekst-blob
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      }
    );
  },
  /* 2. Metadata om serveren (valgfritt) */
  { name: "perplexity-mcp", version: "0.1.0" }
);

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
