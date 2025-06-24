import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { tool, input } = req.body;

  if (!process.env.PERPLEXITY_API_KEY) {
    return res.status(500).json({ error: 'Missing PERPLEXITY_API_KEY' });
  }

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`
      },
      body: JSON.stringify({
        model: 'sonar-medium-online',
        messages: input.messages
      })
    });

    const result = await response.json();
    res.status(200).json({
      tool_call_id: tool.name,
      output: result
    });
  } catch (e) {
    res.status(500).json({ error: e?.toString?.() || 'Unknown error' });
  }
}
