// api/mcp.ts  –  MCP-server for Perplexity (Node-runtime)

// ---------- 1) IMPORTER ----------
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";

// ---------- 2) HJELPEFUNKSJON ----------
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY!;

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

// ---------- 3) Zod-skjema ----------
const searchInput = z.object({ query: z.string() });
const fetchInput  = z.object({ id: z.string() });

// ---------- 4) Tool-implementasjoner ----------
async function doSearch(i: z.infer<typeof searchInput>) {
  const text = await askPerplexity(i.query);
  return {
    results: [
      {
        id: Buffer.from(i.query).toString("base64"),
        title: `Svar for: ${i.query.slice(0, 50)}…`,
        text: text.slice(0, 400) + "…",
        url: null,
      },
    ],
  };
}

async function doFetch(i: z.infer<typeof fetchInput>) {
  const original = Buffer.from(i.id, "base64").toString("utf-8");
  const full = await askPerplexity(original);
  return {
    id: i.id,
    title: `Fullt svar for: ${original}`,
    text: full,
    url: null,
    metadata: null,
  };
}

// ---------- 5) HOVED-HANDLER ----------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  /* --- CORS for OpenAI Connector --- */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();          // Preflight OK
  }

  /* --- server_hello på GET (SSE) --- */
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");

    const hello = {
      jsonrpc: "2.0",
      method: "server_hello",
      params: {
        protocolVersion: "2025-03-26",
        serverInfo: { name: "Perplexity-MCP", version: "0.1.0" },
        capabilities: { streaming: false },
        instructions: "Bruk verktøyene search og fetch",
      },
    };

    res.write("data: " + JSON.stringify(hello) + "\n\n");
    return res.end();
  }

  /* --- JSON-RPC på POST --- */
  try {
    const { id, method, params } = req.body ?? {};

    // tools/list ---------------------------------------------------
    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "search",
              description: "Søker via Perplexity Sonar-pro",
              input_schema: {
                type: "object",
                properties: { query: { type: "string" } },
                required: ["query"],
              },
            },
            {
              name: "fetch",
              description: "Henter fulltekst fra Perplexity",
              input_schema: {
                type: "object",
                properties: { id: { type: "string" } },
                required: ["id"],
              },
            },
          ],
        },
      });
    }

    // tools/call ---------------------------------------------------
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

    // ukjent metode ------------------------------------------------
    throw new Error(`Ukjent metode: ${method}`);
  } catch (err: any) {
    return res.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: err.message ?? "Serverfeil" },
    });
  }
}
