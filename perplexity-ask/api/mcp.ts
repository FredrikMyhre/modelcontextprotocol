import { z } from "zod";
import { createMcpHandler } from "@vercel/mcp-adapter";

// Denne koden er uendret og fungerer fint.
const perplexityApiKey = process.env.PERPLEXITY_API_KEY;

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

// ------ HER ER ENDRINGENE ------

const handler = createMcpHandler(
  (server) => {
    // ----- search (Påkrevd av OpenAI) -----
    server.tool(
      "search",
      "Søker etter informasjon via Perplexity.",
      { query: z.string().describe("Søkespørringen.") },
      async ({ query }) => {
        try {
          const replyText = await callPerplexity([{ role: "user", content: query }]);
          
          // Vi lager det objektet OpenAI forventer...
          const searchResults = {
            results: [{
              id: Buffer.from(query).toString('base64'),
              title: `Svar for: "${query.substring(0, 50)}..."`,
              text: replyText.substring(0, 400) + '...',
              url: null,
            }]
          };

          // ...og returnerer det som en enkel tekst-streng. Adapteren håndterer resten.
          return {
            content: [{ type: "text", text: JSON.stringify(searchResults) }],
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{ type: "text", text: JSON.stringify({ error: error.message }) }],
          };
        }
      }
    );

    // ----- fetch (Påkrevd av OpenAI) -----
    server.tool(
      "fetch",
      "Henter fullstendig innhold for en ressurs-ID.",
      { id: z.string().describe("ID fra 'search'-resultatet.") },
      async ({ id }) => {
        try {
          const originalQuery = Buffer.from(id, 'base64').toString('utf-8');
          const fullText = await callPerplexity([{ role: "user", content: originalQuery }]);

          // Vi lager objektet OpenAI forventer...
          const fetchResult = {
            id: id,
            title: `Fullt svar for: "${originalQuery}"`,
            text: fullText,
            url: null,
            metadata: null
          };

          // ...og returnerer det som en enkel tekst-streng.
          return {
            content: [{ type: "text", text: JSON.stringify(fetchResult) }],
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{ type: "text", text: JSON.stringify({ error: error.message }) }],
          };
        }
      }
    );
  },
  // Vi fjerner server-metadata herfra, da Vercel-adapteren ikke bruker det på denne måten.
  // Den henter info fra package.json eller ignorerer det.
);

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
