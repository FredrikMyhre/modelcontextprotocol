// api/mcp.ts
import { z } from "zod";
import { createMcpHandler } from "@vercel/mcp-adapter";

/**
 * Henter Perplexity API-nøkkel fra miljøvariabler.
 * Avslutter prosessen hvis nøkkelen ikke er satt.
 */
const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
if (!perplexityApiKey) {
  console.error("PERPLEXITY_API_KEY er ikke satt i miljøvariablene.");
  // I et servermiljø som Vercel, vil dette føre til en funksjonsfeil,
  // som er ønskelig hvis konfigurasjonen er ufullstendig.
  // I lokal utvikling, husk å sette denne i en .env-fil.
}

const handler = createMcpHandler(
  /* 1. Definer verktøyene */
  (server) => {
    // ----- perplexity_ask -----
    server.tool(
      "perplexity_ask",
      "Live web-søk via Perplexity Sonar-pro",
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
        // Avslutt tidlig hvis API-nøkkelen mangler.
        if (!perplexityApiKey) {
          return {
            isError: true,
            content: [{ type: "text", text: "Perplexity API-nøkkel er ikke konfigurert på serveren." }],
          };
        }

        try {
          const response = await fetch(
            "https://api.perplexity.ai/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${perplexityApiKey}`,
              },
              body: JSON.stringify({
                model: "sonar-pro",
                messages,
              }),
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Perplexity API Error: ${response.status} ${response.statusText}`, errorText);
            return {
              isError: true,
              content: [{ type: "text", text: `Feil fra Perplexity API: ${response.statusText}` }],
            };
          }

          const data = await response.json();
          
          // Hent ut selve tekst-svaret fra Perplexity
          const replyText = data.choices?.[0]?.message?.content ?? "Fikk ikke et gyldig svar fra Perplexity.";

          // Returner svaret i et standard MCP-format
          return { content: [{ type: "text", text: replyText }] };

        } catch (error) {
          console.error("En feil oppstod under kall til Perplexity API:", error);
          return {
            isError: true,
            content: [{ type: "text", text: "En intern feil oppstod ved kall til Perplexity." }],
          };
        }
      }
    );

    // Du kan legge til dine andre verktøy ('search', 'fetch') her om nødvendig.
  },
  /* 2. Metadata om serveren (valgfritt) */
  {
    name: "perplexity-mcp",
    version: "0.1.0",
  }
);

// Eksporter handleren for Vercel sine serverless funksjoner
export const GET = handler;
export const POST = handler;
export const DELETE = handler;
