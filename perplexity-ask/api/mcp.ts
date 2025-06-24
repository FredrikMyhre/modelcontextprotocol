// api/mcp.ts
import { z } from "zod";
import { createMcpHandler } from "@vercel/mcp-adapter";

/**
 * Henter Perplexity API-nøkkel fra miljøvariabler.
 * Dette er en kritisk del av konfigurasjonen.
 */
const perplexityApiKey = process.env.PERPLEXITY_API_KEY;

// Funksjon for å kalle Perplexity API. Gjenbrukes av de andre verktøyene.
async function callPerplexity(messages: { role: string; content: string }[]) {
  if (!perplexityApiKey) {
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
    throw new Error(`Feil fra Perplexity API: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "Fikk ikke et gyldig svar fra Perplexity.";
}

const handler = createMcpHandler(
  /* 1. Definer verktøyene */
  (server) => {
    // ----- search (Påkrevd av OpenAI Connector) -----
    server.tool(
      "search",
      "Søker etter ressurser ved hjelp av en spørring.",
      {
        query: z.string().describe("Søkespørringen."),
      },
      async ({ query }) => {
        try {
          const replyText = await callPerplexity([{ role: "user", content: query }]);
          
          // OpenAI forventer en liste med resultater. Vi lager ett resultat basert på Perplexity-svaret.
          const searchResult = {
            id: Buffer.from(query).toString('base64'), // Bruker base64 av spørringen som en unik ID
            title: `Resultat for: "${query}"`,
            text: replyText.substring(0, 300) + '...', // Sender et utdrag
            url: null,
          };

          return { results: [searchResult] };
        } catch (error: any) {
          console.error("Feil i 'search'-verktøyet:", error);
          // Returner en tom liste ved feil, slik OpenAI-connectoren forventer
          return { results: [] };
        }
      }
    );

    // ----- fetch (Påkrevd av OpenAI Connector) -----
    server.tool(
      "fetch",
      "Henter det fullstendige innholdet for en spesifikk ressurs-ID.",
      {
        id: z.string().describe("ID-en til ressursen som skal hentes."),
      },
      async ({ id }) => {
        try {
          // ID-en er den base64-kodede originale spørringen.
          const originalQuery = Buffer.from(id, 'base64').toString('utf-8');
          const fullText = await callPerplexity([{ role: "user", content: originalQuery }]);

          return {
            id: id,
            title: `Fullt resultat for: "${originalQuery}"`,
            text: fullText,
            url: null,
            metadata: null,
          };
        } catch (error: any) {
          console.error("Feil i 'fetch'-verktøyet:", error);
          return {
            isError: true,
            content: [{ type: "text", text: error.message || "Klarte ikke hente ressurs." }],
          };
        }
      }
    );

    // ----- perplexity_ask (Ditt originale verktøy, kan beholdes for andre formål) -----
    server.tool(
      "perplexity_ask",
      "Live web-søk via Perplexity Sonar-pro (direkte kall).",
      {
        messages: z
          .array(
            z.object({
              role: z.enum(["system", "user", "assistant"]),
              content: z.string(),
            })
          )
          .min(1)
          .describe("En samtalehistorikk for å sende til Perplexity."),
      },
      async ({ messages }) => {
        try {
          const replyText = await callPerplexity(messages);
          return { content: [{ type: "text", text: replyText }] };
        } catch (error: any) {
          console.error("Feil i 'perplexity_ask'-verktøyet:", error);
          return {
            isError: true,
            content: [{ type: "text", text: error.message || "En intern feil oppstod." }],
          };
        }
      }
    );
  },
  /* 2. Metadata om serveren */
  {
    name: "perplexity-mcp-for-openai",
    version: "1.1.0",
  }
);

// Eksporter handleren for Vercel sine serverless funksjoner
export const GET = handler;
export const POST = handler;
export const DELETE = handler;
