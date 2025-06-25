// api/mcp.ts – MCP server (Streamable HTTP on Vercel Functions)
// -----------------------------------------------------------------------------
// This revision aligns the endpoint 100 % with the MCP 2025‑03‑26 specification
// so it can be registered as an **OpenAI ChatGPT Connector** without HTTP 500s.
// -----------------------------------------------------------------------------

/* 1 – Imports */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";

/* 2 – Perplexity helper */
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY ?? "";

async function askPerplexity(query: string): Promise<string> {
  if (!PERPLEXITY_API_KEY) {
    throw new Error("PERPLEXITY_API_KEY environment‑variable mangler");
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
    throw new Error(`Perplexity-feil ${r.status}: ${await r.text()}`);
  }
  const data = await r.json();
  return data?.choices?.[0]?.message?.content ?? "(tomt svar)";
}

/* 3 – JSON‑schemaer */
const searchInput = z.object({ query: z.string() });
const fetchInput = z.object({ id: z.string() });

/* 4 – Tool‑implementasjoner */
async function doSearch(i: z.infer<typeof searchInput>) {
  const txt = await askPerplexity(i.query);
  return {
    results: [
      {
        id: Buffer.from(i.query).toString("base64"),
        title: `Svar for: ${i.query.slice(0, 60)}`,
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
    title: `Fullt svar for: ${original}`,
    text: txt,
    url: null,
    metadata: null,
  };
}

/* 5 – Helpers */
function ok(res: VercelResponse, body: unknown) {
  return res.status(200).json(body);
}

function rpcError(
  res: VercelResponse,
  id: unknown,
  code: number,
  message: string,
  data?: unknown,
) {
  return ok(res, {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, data },
  });
}

/* 6 – HTTP‑handler */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  /* CORS (required by ChatGPT Connectors) */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  /* -------------------------------------------------------------------------- */
  /* GET: optional SSE stream with a single server_hello event                  */
  /* -------------------------------------------------------------------------- */
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
            serverInfo: { name: "Perplexity‑MCP", version: "0.2.0" },
            capabilities: { tools: { listChanged: false } },
            instructions: "Bruk verktøyene search og fetch",
          },
        }) +
        "\n\n",
    );
    // Hold the stream open (do not res.end()) so the client can reuse it later.
    return;
  }

  /* -------------------------------------------------------------------------- */
  /* POST: all JSON‑RPC traffic (Streamable HTTP)                                */
  /* -------------------------------------------------------------------------- */
  try {
    // The Vercel Node API may leave the body as string – ensure we have an object
    const body =
      typeof req.body === "string" && req.body.length
        ? JSON.parse(req.body)
        : req.body;

    const { id, method, params } = body ?? {};

    /* 6.1 initialize */
    if (method === "initialize") {
      return ok(res, {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-03-26",
          serverInfo: { name: "Perplexity‑MCP", version: "0.2.0" },
          capabilities: { tools: { listChanged: false } },
          instructions: "Bruk verktøyene search og fetch",
        },
      });
    }

    /* 6.2 tools/list */
    if (method === "tools/list") {
      return ok(res, {
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "search",
              description: "Søker via Perplexity (Sonar‑pro)",
              inputSchema: {
                type: "object",
                properties: { query: { type: "string" } },
                required: ["query"],
              },
            },
            {
              name: "fetch",
              description: "Henter fulltekst fra Perplexity",
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

    /* 6.3 tools/call */
    if (method === "tools/call") {
      const { name, arguments: args } = params ?? {};

      switch (name) {
        case "search": {
          const parsed = searchInput.parse(args);
          const output = await doSearch(parsed);
          return ok(res, { jsonrpc: "2.0", id, result: output });
        }
        case "fetch": {
          const parsed = fetchInput.parse(args);
          const output = await doFetch(parsed);
          return ok(res, { jsonrpc: "2.0", id, result: output });
        }
        default:
          return rpcError(res, id, -32601, `Ukjent tool: ${name}`);
      }
    }

    /* 6.4 ukjent metode */
    return rpcError(res, id, -32601, `Ukjent metode: ${method}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // -32603 = internal error (JSON‑RPC standard)
    return rpcError(res, null, -32603, msg);
  }
}
