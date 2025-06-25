// api/mcp.ts  – MCP-server for Perplexity  (Edge Function)

export const config = { runtime: "edge" };          //  <-- viktig

import { z } from "zod";
import { createMcpHandler } from "@vercel/mcp-adapter";

/* ----------  Perplexity helper  ---------- */

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

async function askPerplexity(query: string): Promise<string> {
  if (!PERPLEXITY_API_KEY) {
    throw new Error("PERPLEXITY_API_KEY mangler i miljøvariablene.");
  }

  const r = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [{ role: "user", content: query }],
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Perplexity-feil ${r.status}: ${err}`);
  }

  const data = await r.json();
  return data?.choices?.[0]?.message?.content ?? "(tomt svar)";
}

/* ----------  MCP-handler med samme SEARCH & FETCH-logikk  ---------- */

const handler = createMcpHandler((server) => {
  /* ---- search ---- */
  server.tool(
    "search",
    "Søker etter informasjon via Perplexity.",
    { query: z.string().describe("Søkestreng") },
    async ({ query }) => {
      const text = await askPerplexity(query);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              results: [
                {
                  id: Buffer.from(query).toString("base64"),
                  title: `Svar for: ${query.slice(0, 50)}…`,
                  text: text.slice(0, 400) + "…",
                  url: null,
                },
              ],
            }),
          },
        ],
      };
    }
  );

  /* ---- fetch ---- */
  server.tool(
    "fetch",
    "Henter fulltekst for en ressurs-ID.",
    { id: z.string() },
    async ({ id }) => {
      const original = Buffer.from(id, "base64").toString("utf-8");
      const full = await askPerplexity(original);

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

/* ----------  Eksport for Edge Function ---------- */
export default handler;
