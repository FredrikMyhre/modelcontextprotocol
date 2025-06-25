// api/mcp.ts – MCP server (Vercel Edge Functions)
// -----------------------------------------------------------------------------
// v0.4.0 – 100 % spec‑compliant for **deep‑research connectors**
//   • search → returns `{results:[...]}`
//   • fetch  → returns full document
//   • tools definitions expose *inputSchema* **and** *outputSchema*
//   • JSON‑RPC envelopes unchanged
// -----------------------------------------------------------------------------

/* 1 – Imports */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";

/* 2 – Perplexity helper */
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY ?? "";

async function askPerplexity(query: string, model: string = "sonar-pro") {
  if (!PERPLEXITY_API_KEY) throw new Error("PERPLEXITY_API_KEY mangler");
  const r = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({ model, messages: [{ role: "user", content: query }] }),
  });
  if (!r.ok) throw new Error(`Perplexity-feil ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.choices?.[0]?.message?.content ?? "(tomt svar)";
}

/* 3 – Schemas */
const SearchInput = z.object({ query: z.string() });
const FetchInput  = z.object({ id: z.string() });

type SearchOutput = {
  results: { id: string; title: string; text: string; url: string | null }[];
};

/* 4 – Tool helpers */
function okJson(res: VercelResponse, body: unknown) {
  return res.status(200).json(body);
}
function rpcError(res: VercelResponse, id: unknown, code: number, message: string) {
  return okJson(res, { jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

/* 5 – Tool implementations */
async function doSearch(query: string): Promise<SearchOutput> {
  const answer = await askPerplexity(query);
  return {
    results: [
      {
        id: Buffer.from(query).toString("base64"),
        title: `Svar for: ${query.slice(0, 80)}…`,
        text: answer.slice(0, 400) + (answer.length > 400 ? "…" : ""),
        url: null, // Perplexity doesn’t give canonical URL per answer
      },
    ],
  };
}

async function doFetch(id: string) {
  const original = Buffer.from(id, "base64").toString("utf-8");
  const answer   = await askPerplexity(original);
  return {
    id,
    title: `Fullt svar for: ${original}`,
    text: answer,
    url: null,
    metadata: null,
  };
}

/* 6 – HTTP handler */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ----- CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  // ----- SSE handshake (server_hello)
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
            serverInfo: { name: "Perplexity‑MCP", version: "0.4.0" },
            capabilities: { tools: { listChanged: false } },
            instructions:
              "Bruk verktøyene \"search\" og \"fetch\" for å spørre Perplexity. \n• search(query) → korte treff med id  \n• fetch(id)    → fullt svar",
          },
        }) +
        "\n\n",
    );
    return; // keep connection open (client will close)
  }

  // ----- POST JSON‑RPC
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { id, method, params } = body ?? {};

    /* initialize */
    if (method === "initialize") {
      return okJson(res, {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-03-26",
          serverInfo: { name: "Perplexity‑MCP", version: "0.4.0" },
          capabilities: { tools: { listChanged: false } },
          instructions:
            "Bruk verktøyene \"search\" og \"fetch\" for å spørre Perplexity. \n• search(query) → korte treff med id  \n• fetch(id)    → fullt svar",
        },
      });
    }

    /* tools/list */
    if (method === "tools/list") {
      return okJson(res, {
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "search",
              description:
                "Søk i Perplexity Sonar‑pro. Returnerer et kort sammendrag i \"text\" samt en \"id\" som kan brukes i fetch.",
              inputSchema: {
                type: "object",
                properties: { query: { type: "string" } },
                required: ["query"],
              },
              outputSchema: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        title: { type: "string" },
                        text: { type: "string" },
                        url: { type: ["string", "null"] },
                      },
                      required: ["id", "title", "text"],
                    },
                  },
                },
                required: ["results"],
              },
            },
            {
              name: "fetch",
              description:
                "Hent fullt svar fra Perplexity for en tidligere søke‑id og gjør det tilgjengelig for sitering.",
              inputSchema: {
                type: "object",
                properties: { id: { type: "string" } },
                required: ["id"],
              },
              outputSchema: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  title: { type: "string" },
                  text: { type: "string" },
                  url: { type: ["string", "null"] },
                  metadata: { type: ["object", "null"], additionalProperties: { type: "string" } },
                },
                required: ["id", "title", "text"],
              },
            },
          ],
        },
      });
    }

    /* tools/call */
    if (method === "tools/call") {
      const { name, arguments: args } = params ?? {};

      switch (name) {
        case "search": {
          const { query } = SearchInput.parse(args);
          return okJson(res, { jsonrpc: "2.0", id, result: await doSearch(query) });
        }
        case "fetch": {
          const { id: fid } = FetchInput.parse(args);
          return okJson(res, { jsonrpc: "2.0", id, result: await doFetch(fid) });
        }
        default:
          return rpcError(res, id, -32601, `Ukjent tool: ${name}`);
      }
    }

    // Unknown method
    return rpcError(res, id, -32601, `Ukjent metode: ${method}`);
  } catch (err: unknown) {
    console.error("⛔️ Internal MCP‑error", err);
    return rpcError(
      res,
      null,
      -32603,
      err instanceof Error ? err.message : String(err),
    );
  }
}
