// api/mcp.ts
import { z } from "zod";
// Importerer de spesifikke typene for respons-objekter for å sikre 100% kompatibilitet.
import { createMcpHandler, McpToolResponse, McpSearchResult, McpServerOptions } from "@vercel/mcp-adapter";

/**
 * Henter Perplexity API-nøkkel fra miljøvariabler.
 */
const perplexityApiKey = process.env.PERPLEXITY_API_KEY;

/**
 * Funksjon for å kalle Perplexity API. Gjenbrukes av verktøyene.
 * @param messages - Samtalehistorikk som sendes til Perplexity.
 * @returns Svaret fra Perplexity som en tekststreng.
 */
async function callPerplexity(messages: { role: string; content: string }[]): Promise<string> {
  if (!perplexityApiKey) {
    console.error("PERPLEXITY_API_KEY er ikke satt i miljøvariablene.");
    throw new Error("Perplexity API-nøkkel er ikke konfigurert på serveren.");
  }

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${perplexityApiKey}`,
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Perplexity API Error: ${response.status} ${response.statusText}`, errorText);
    throw new Error(`Feil fra Perplexity API: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "Fikk ikke et gyldig svar fra Perplexity.";
}

/**
 * Metadatainformasjon for serveren.
 * OpenAI kan vise 'description' i sitt UI.
 */
const serverOptions: McpServerOptions = {
    name: "Perplexity via Vercel",
    version: "1.1.0",
    description: "En MCP-server som bruker Perplexity API for å svare på spørsmål i sanntid.",
    // Spesifiserer at ingen egen-laget autentisering er i bruk.
    authentication: {
      type: 'none',
    },
};

const handler = createMcpHandler(
  (server) => {
    // ----- search (Påkrevd av OpenAI Connector) -----
    server.tool(
      "search",
      "Søker etter informasjon ved hjelp av en spørring via Perplexity.",
      {
        query: z.string().describe("Søkespørringen."),
      },
      // Returnerer en Promise som resolverer til et objekt med en 'results'-liste.
      async ({ query }): Promise<{ results: McpSearchResult[] }> => {
        try {
          const replyText = await callPerplexity([{ role: "user", content: query }]);

          const searchResult: McpSearchResult = {
            id: Buffer.from(query).toString('base64'),
            title: `Svar for: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`,
            text: replyText.substring(0, 400) + '...',
            url: null,
          };

          return { results: [searchResult] };
        } catch (error: any) {
          console.error("Feil i 'search'-verktøyet:", error);
          // Returner en tom liste ved feil, slik OpenAI-connectoren forventer.
          return { results: [] };
        }
      }
    );

    // ----- fetch (Påkrevd av OpenAI Connector) -----
    server.tool(
      "fetch",
      "Henter det fullstendige innholdet for en spesifikk ressurs-ID.",
      {
        id: z.string().describe("Base64-kodet ID fra 'search'-resultatet."),
      },
      // Returnerer en Promise som resolverer til en McpToolResponse.
      async ({ id }): Promise<McpToolResponse> => {
        try {
          const originalQuery = Buffer.from(id, 'base64').toString('utf-8');
          const fullText = await callPerplexity([{ role: "user", content: originalQuery }]);

          // Dette er det forventede formatet for et vellykket 'fetch'-kall.
          return {
            content: [{ type: "text", text: fullText }],
          };
        } catch (error: any) {
          console.error("Feil i 'fetch'-verktøyet:", error);
          // Returner en standardisert feilmelding som MCP forstår.
          return {
            isError: true,
            content: [{ type: "text", text: `Klarte ikke hente ressurs for ID ${id}. Feil: ${error.message}` }],
          };
        }
      }
    );
  },
  serverOptions
);

// Eksporter handleren for Vercel sine serverless funksjoner
export const GET = handler;
export const POST = handler;
export const DELETE = handler;
