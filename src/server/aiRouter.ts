import { GoogleGenAI } from '@google/genai';
import type { Request, Response } from 'express';

// Helper to get GoogleGenAI client lazily
function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('服务器端 GEMINI_API_KEY 未配置');
  }
  return new GoogleGenAI({ apiKey });
}

// Built-in supported Gemini models list
export const BUILTIN_MODELS = [
  { id: 'gemini-3.6-flash', name: '[⚡默认] Gemini 3.6 Flash' },
  { id: 'gemini-3.1-pro-preview', name: '[🧠强推] Gemini 3.1 Pro' },
  { id: 'gemini-3.1-flash-lite', name: '[🚀极速] Gemini 3.1 Flash Lite' },
];

export async function handleModelsRequest(req: Request, res: Response) {
  try {
    const { baseUrl, apiKey, provider } = req.query;

    if (provider === 'custom-openai' && baseUrl && apiKey) {
      const cleanUrl = String(baseUrl).replace(/\/+$/, '');
      const response = await fetch(`${cleanUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `无法获取模型列表: ${errText.slice(0, 200)}` });
      }

      const data = await response.json();
      const models = (data.data || []).map((m: any) => ({
        id: m.id,
        name: m.id,
      }));
      return res.json({ data: models });
    }

    // Default built-in models
    return res.json({ data: BUILTIN_MODELS });
  } catch (error: any) {
    console.error('Error in handleModelsRequest:', error);
    return res.status(500).json({ error: error.message || '获取模型列表失败' });
  }
}

export async function handleChatCompletionRequest(req: Request, res: Response) {
  try {
    const { provider, baseUrl, apiKey, model, messages, temperature = 0.8, stream = true } = req.body;

    // --- Custom OpenAI Compatible API ---
    if (provider === 'custom-openai' && baseUrl && apiKey) {
      const cleanUrl = String(baseUrl).replace(/\/+$/, '');
      const targetUrl = `${cleanUrl}/chat/completions`;

      const customRes = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          stream,
        }),
      });

      if (!customRes.ok) {
        const errText = await customRes.text();
        return res.status(customRes.status).json({ error: `API 错误 (${customRes.status}): ${errText.slice(0, 400)}` });
      }

      if (stream && customRes.body) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const reader = (customRes.body as any).getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
        return res.end();
      } else {
        const json = await customRes.json();
        return res.json(json);
      }
    }

    // --- Built-in Gemini API using @google/genai ---
    const ai = getGenAI();
    let modelName = model || 'gemini-3.6-flash';
    if (modelName.includes('gemini-2.') || modelName.includes('gemini-1.')) {
      modelName = 'gemini-3.6-flash'; // Upgrade old deprecated model references
    }

    let systemInstruction = '';
    const formattedContents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    if (Array.isArray(messages)) {
      for (const msg of messages) {
        if (msg.role === 'system') {
          systemInstruction += (systemInstruction ? '\n\n' : '') + msg.content;
        } else if (msg.role === 'user') {
          formattedContents.push({ role: 'user', parts: [{ text: msg.content }] });
        } else if (msg.role === 'assistant' || msg.role === 'model') {
          formattedContents.push({ role: 'model', parts: [{ text: msg.content }] });
        }
      }
    }

    // If no contents provided, create fallback from prompt
    if (formattedContents.length === 0) {
      formattedContents.push({ role: 'user', parts: [{ text: '请继续创作。' }] });
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const responseStream = await ai.models.generateContentStream({
        model: modelName,
        contents: formattedContents,
        config: {
          systemInstruction: systemInstruction || undefined,
          temperature: Number(temperature) || 0.8,
        },
      });

      for await (const chunk of responseStream) {
        const text = chunk.text || '';
        if (text) {
          const sseData = {
            choices: [
              {
                delta: { content: text },
              },
            ],
          };
          res.write(`data: ${JSON.stringify(sseData)}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
      return res.end();
    } else {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: formattedContents,
        config: {
          systemInstruction: systemInstruction || undefined,
          temperature: Number(temperature) || 0.8,
        },
      });

      const responseText = response.text || '';
      return res.json({
        choices: [
          {
            message: { content: responseText },
          },
        ],
        model: modelName,
      });
    }
  } catch (error: any) {
    console.error('Error in handleChatCompletionRequest:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || 'AI 生成处理请求失败' });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      return res.end();
    }
  }
}
