// api/mcp.ts  –  MCP server (Node, SSE + JSON-RPC)

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";

/* ----------  Perplexity helper  ---------- */

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
  const data = await r.json();
  return data?.choices?.[0]?.message?.content ?? "(tomt svar)";
}

/* ----------  Tool-implementasjoner  ---------- */

const searchInput = z.object({ query: z.string() });
const fetchInput = z.object({ id: z.string() });

async function doSearch(i: z.infer<typeof searchInput>) {
  const txt = await askPerplexity(i.query);
  return {
    results: [
      {
        id: Buffer.from(i.query).toString("base64"),
        title: `Svar for: ${i.query.slice(0, 50)}…`,
        text: txt.slice(0, 400) + "…",
        url: null,
      },
    ],
  };
}

async function doFetch(i: z.infer<typeof fetchInput>) {
  const original = Buffer.from(i.id, "base64").toString("utf-8");
  const txt = await askPerplexity(original);
  return {
    id: i.id,
    title: `Fullt svar for: ${original}`,
    text: txt,
    url: null,
    metadata: null,
  };
}

/* ----------  Serverless handler  ---------- */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  /* ---- 1) server_hello for GET (SSE) ---- */
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.write(
      "data: " +
        JSON.stringify({
          jsonrpc: "2.0",
          method: "server_hello",
          params: {
            protocolVersion: "2025-03-26",
            serverInfo: { name: "Perplexity-MCP", version: "0.1.0" },
            capabilities: { streaming: false },
            instructions: "Bruk verktøyene search og fetch",
          },
        }) +
        "\n\n"
    );
    return res.end();
  }

  /* ---- 2) JSON-RPC over POST ---- */
  try {
    const { id, method, params } = req.body ?? {};

    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "search",
              description: "Søker via Perplexity Sonar-pro",
              input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
            },
            {
              name: "fetch",
              description: "Henter fulltekst fra Perplexity",
              input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
            },
          ],
        },
      });
    }

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

    throw new Error(`Ukjent metode: ${method}`);
  } catch (err: any) {
    return res.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: err.message ?? "Serverfeil" },
    });
  }
}
