// api/mcp.ts – MCP server (Streamable HTTP on Vercel Functions)
// -----------------------------------------------------------------------------
// v0.3.0 – Return **spec‑compliant tool results** (content[] + isError)
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
const FetchInput = z.object({ id: z.string() });

/* 4 – Spec‑compliant helpers */
function ok(res: VercelResponse, body: unknown) {
  return res.status(200).json(body);
}
function rpcError(res: VercelResponse, id: unknown, code: number, message: string) {
  return ok(res, {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  });
}
function textResult(text: string) {
  return {
    content: [{ type: "text", text }],
    isError: false,
  } as const;
}

/* 5 – Tool implementations */
async function doSearch(q: string) {
  const answer = await askPerplexity(q);
  return textResult(answer);
}
async function doFetch(id: string) {
  const original = Buffer.from(id, "base64").toString("utf-8");
  const answer = await askPerplexity(original);
  return textResult(answer);
}

/* 6 – HTTP handler */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ----- CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  // ----- SSE server_hello
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
            serverInfo: { name: "Perplexity‑MCP", version: "0.3.0" },
            capabilities: { tools: { listChanged: false } },
            instructions: "Bruk verktøyene search og fetch",
          },
        }) +
        "\n\n",
    );
    return; // keep-alive
  }

  // ----- POST JSON‑RPC
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { id, method, params } = body ?? {};

    /* initialize */
    if (method === "initialize") {
      return ok(res, {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-03-26",
          serverInfo: { name: "Perplexity‑MCP", version: "0.3.0" },
          capabilities: { tools: { listChanged: false } },
          instructions: "Bruk verktøyene search og fetch",
        },
      });
    }

    /* tools/list */
    if (method === "tools/list") {
      return ok(res, {
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "search",
              description: "Søker via Perplexity Sonar‑pro",
              inputSchema: {
                type: "object",
                properties: { query: { type: "string" } },
                required: ["query"],
              },
            },
            {
              name: "fetch",
              description: "Henter fulltekst fra Perplexity basert på ID",
              inputSchema: {
                type: "object",
                properties: { id: { type: "string" } },
                required: ["id"],
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
          return ok(res, { jsonrpc: "2.0", id, result: await doSearch(query) });
        }
        case "fetch": {
          const { id: fid } = FetchInput.parse(args);
          return ok(res, { jsonrpc: "2.0", id, result: await doFetch(fid) });
        }
        default:
          return rpcError(res, id, -32601, `Ukjent tool: ${name}`);
      }
    }

    return rpcError(res, id, -32601, `Ukjent metode: ${method}`);
  } catch (err: unknown) {
    return rpcError(res, null, -32603, err instanceof Error ? err.message : String(err));
  }
}
