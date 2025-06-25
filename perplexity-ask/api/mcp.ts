// api/mcp.ts   – MCP-handler for Perplexity

// Fortell Vercel at denne funksjonen skal kjøres som Edge Runtime
export const config = { runtime: "edge" };

import { z } from "zod";
import { createMcpHandler } from "@vercel/mcp-adapter";

/* ----------  Hjelpefunksjon: kaller Perplexity  ---------- */

const perplexityApiKey = process.env.PERPLEXITY_API_KEY;

async function callPerplexity(
  messages: { role: string; content: string }[]
): Promise<string> {
  if (!perplexityApiKey) {
    throw new Error("PERPLEXITY_API_KEY mangler i miljøvariablene.");
  }

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${perplexityApiKey}`,
    },
    body: JSON.stringify({ model: "sonar-pro", messages }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Perplexity-feil ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "(tomt svar)";
}

/* ----------  MCP-handler  ---------- */

const handler = createMcpHandler((server) => {
  /* ---- search (kreves av OpenAI) ---- */
  server.tool(
    "search",
    "Søker via Perplexity Sonar-pro.",
    { query: z.string().describe("Søkestreng") },
    async ({ query }) => {
      const answer = await callPerplexity([{ role: "user", content: query }]);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              results: [
                {
                  id: Buffer.from(query).toString("base64"),
                  title: `Svar for: ${query.slice(0, 50)}…`,
                  text: answer.slice(0, 400) + "…",
                  url: null,
                },
              ],
            }),
          },
        ],
      };
    }
  );

  /* ---- fetch (kreves av OpenAI) ---- */
  server.tool(
    "fetch",
    "Henter fulltekst for en ressurs-ID.",
    { id: z.string() },
    async ({ id }) => {
      const original = Buffer.from(id, "base64").toString("utf-8");
      const full = await callPerplexity([{ role: "user", content: original }]);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id,
              title: `Fullt svar for: ${original}`,
              text: full,
              url: null,
              metadata: null,
            }),
          },
        ],
      };
    }
  );
});

/* ----------  Eksport for Vercel Function ---------- */
export default handler;
