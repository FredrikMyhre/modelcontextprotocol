// api/mcp.ts  –  Node (Serverless) Vercel Function - MCP-server

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";

/* ----------  Perplexity helper  ---------- */

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

async function askPerplexity(query: string): Promise<string> {
  if (!PERPLEXITY_API_KEY) throw new Error("PERPLEXITY_API_KEY mangler");

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

/* ----------  Verktøy-implementasjoner  ---------- */

const searchInput = z.object({ query: z.string() });
const fetchInput  = z.object({ id: z.string() });

async function doSearch(input: z.infer<typeof searchInput>) {
  const text = await askPerplexity(input.query);
  return {
    results: [
      {
        id: Buffer.from(input.query).toString("base64"),
        title: `Svar for: ${input.query.slice(0, 50)}…`,
        text: text.slice(0, 400) + "…",
        url: null,
      },
    ],
  };
}

async function doFetch(input: z.infer<typeof fetchInput>) {
  const original = Buffer.from(input.id, "base64").toString("utf-8");
  const full = await askPerplexity(original);
  return {
    id: input.id,
    title: `Fullt svar for: ${original}`,
    text: full,
    url: null,
    metadata: null,
  };
}

/* ----------  MCP JSON-RPC handler  ---------- */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { id, method, params } = req.body ?? {};

    /* tools/list --------------------------------------------------- */
    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "search",
              description: "Søker via Perplexity Sonar-pro",
              input_schema: searchInput,
            },
            {
              name: "fetch",
              description: "Henter fulltekst fra Perplexity",
              input_schema: fetchInput,
            },
          ],
        },
      });
    }

    /* tools/call --------------------------------------------------- */
    if (method === "tools/call") {
      const { tool, input } = params ?? {};

      if (tool === "search") {
        const parsed = searchInput.parse(input);
        const output = await doSearch(parsed);
        return res.json({ jsonrpc: "2.0", id, result: { output } });
      }

      if (tool === "fetch") {
        const parsed = fetchInput.parse(input);
        const output = await doFetch(parsed);
        return res.json({ jsonrpc: "2.0", id, result: { output } });
      }

      throw new Error(`Ukjent tool: ${tool}`);
    }

    /* ukjent metode ------------------------------------------------ */
    throw new Error(`Ukjent metode: ${method}`);
  } catch (err: any) {
    res.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: err.message ?? "Serverfeil" },
    });
  }
}
