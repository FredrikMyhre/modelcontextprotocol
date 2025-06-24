import { z } from "zod";
// Importerer fra riktige pakker
import { createMcpHandler } from "@vercel/mcp-adapter";
import type { ToolResult, Resource } from "@modelcontextprotocol/sdk/types";

/**
 * Henter Perplexity API-nøkkel fra miljøvariabler.
 */
const perplexityApiKey = process.env.PERPLEXITY_API_KEY;

/**
 * Funksjon for å kalle Perplexity API.
 */
async function callPerplexity(messages: { role: string; content: string }[]): Promise<string> {
  if (!perplexityApiKey) {
    console.error("PERPLEXITY_API_KEY er ikke satt.");
    throw new Error("Perplexity API-nøkkel er ikke konfigurert.");
  }

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${perplexityApiKey}`,
    },
    body: JSON.stringify({ model: "sonar-pro", messages }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Perplexity API Error: ${response.status} ${response.statusText}`, errorText);
    throw new Error(`Feil fra Perplexity API: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "Fikk ikke et gyldig svar fra Perplexity.";
}

const handler = createMcpHandler(
  (server) => {
    // ----- search (Påkrevd av OpenAI) -----
    server.tool(
      "search",
      "Søker etter informasjon via Perplexity.",
      { query: z.string().describe("Søkespørringen.") },
      // Denne funksjonen må returnere en standard ToolResult
      async ({ query }): Promise<ToolResult> => {
        try {
          const replyText = await callPerplexity([{ role: "user", content: query }]);
          
          // OpenAI forventer en liste med resultater i 'text'-feltet.
          // Vi formaterer det som en JSON-streng.
          const searchResults = [{
            id: Buffer.from(query).toString('base64'),
            title: `Svar for: "${query.substring(0, 50)}..."`,
            text: replyText.substring(0, 400) + '...',
            url: null,
          }];

          // Pakker resultatene inn i det korrekte formatet.
          return {
            content: [{ type: "text", text: JSON.stringify({ results: searchResults }) }],
          };

        } catch (error: any) {
          console.error("Feil i 'search'-verktøyet:", error);
          return {
            isError: true,
            content: [{ type: "text", text: `Søk feilet: ${error.message}` }],
          };
        }
      }
    );

    // ----- fetch (Påkrevd av OpenAI) -----
    server.tool(
      "fetch",
      "Henter fullstendig innhold for en ressurs-ID.",
      { id: z.string().describe("ID fra 'search'-resultatet.") },
      // Returnerer også en standard ToolResult
      async ({ id }): Promise<ToolResult> => {
        try {
          const originalQuery = Buffer.from(id, 'base64').toString('utf-8');
          const fullText = await callPerplexity([{ role: "user", content: originalQuery }]);

          const resource: Resource = {
            id: id,
            title: `Fullt svar for: "${originalQuery}"`,
            text: fullText,
            url: null,
            metadata: null
          }

          // Pakker resultatet inn i det korrekte formatet.
          return { content: [{ type: "text", text: JSON.stringify(resource) }] };
        } catch (error: any) {
          console.error("Feil i 'fetch'-verktøyet:", error);
          return {
            isError: true,
            content: [{ type: "text", text: `Innhenting feilet for ID ${id}: ${error.message}` }],
          };
        }
      }
    );
  },
  {
    name: "Perplexity via Vercel",
    version: "1.2.0",
    description: "MCP-server som bruker Perplexity API for sanntidssøk.",
  }
);

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
