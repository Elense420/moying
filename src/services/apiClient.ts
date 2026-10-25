import { beginGlobalActivity } from './activityTracker';

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'model';
  content: string;
}

export interface StreamChatOptions {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  messages: Message[];
  temperature?: number;
  onChunk: (chunk: string) => void;
  signal?: AbortSignal;
}

function isDirectExternalApi(provider?: string, baseUrl?: string, apiKey?: string): boolean {
  if (!baseUrl || !apiKey) return false;
  if (provider === 'built-in-gemini') return false;
  if (baseUrl.startsWith('/api')) return false;
  if (apiKey === 'BUILTIN_KEY') return false;
  return true;
}

// Direct browser fetch to custom OpenAI-compatible endpoint (DeepSeek, SiliconFlow, Volcengine, Kimi, Aliyun, OneAPI)
async function directBrowserChatStream(options: StreamChatOptions): Promise<{ content: string }> {
  const { baseUrl, apiKey, model, messages, temperature = 0.85, onChunk, signal } = options;
  if (!baseUrl) {
    throw new Error('未配置 API 地址 (Base URL)。请前往「引擎与技能」页面选择国内直连预设或填写 API 线路。');
  }

  const cleanUrl = baseUrl.replace(/\/+$/, '');
  const targetUrl = cleanUrl.endsWith('/chat/completions') ? cleanUrl : `${cleanUrl}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.content,
      })),
      temperature,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    let errorMessage = `API 响应错误 (${response.status})`;
    try {
      const errJson = JSON.parse(text);
      if (errJson.error?.message) errorMessage = errJson.error.message;
      else if (errJson.error) errorMessage = typeof errJson.error === 'string' ? errJson.error : JSON.stringify(errJson.error);
    } catch {
      if (text) errorMessage = text.slice(0, 300);
    }
    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error('未收到 API 流式数据响应');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;

      if (trimmed.startsWith('data: ')) {
        try {
          const rawJson = trimmed.slice(6);
          const json = JSON.parse(rawJson);

          if (json.error) {
            throw new Error(typeof json.error === 'string' ? json.error : json.error.message || '模型响应错误');
          }

          const deltaContent = json.choices?.[0]?.delta?.content;
          if (deltaContent) {
            fullContent += deltaContent;
            onChunk(deltaContent);
          }
        } catch (err: any) {
          if (err.message && !err.message.includes('JSON')) {
            throw err;
          }
        }
      }
    }
  }

  return { content: fullContent };
}

async function streamChatCompletionInternal(options: StreamChatOptions): Promise<{ content: string }> {
  const { provider, baseUrl, apiKey, model, messages, temperature = 0.85, onChunk, signal } = options;

  // For domestic direct APIs (DeepSeek / SiliconFlow / Volcengine / Kimi / Aliyun / OneAPI), stream directly from browser first!
  if (isDirectExternalApi(provider, baseUrl, apiKey)) {
    try {
      return await directBrowserChatStream(options);
    } catch (directErr: any) {
      const isNetworkOrCors = directErr instanceof TypeError || String(directErr?.message || '').includes('Failed to fetch');
      if (!isNetworkOrCors) {
        throw directErr;
      }
      console.warn('浏览器直连遇到跨域限制，尝试通过服务端代理转发...', directErr);
    }
  }

  const resolvedProvider =
    provider === 'built-in-gemini' || baseUrl === '/api/ai' || !baseUrl
      ? 'built-in-gemini'
      : 'custom-openai';

  const bodyPayload = {
    provider: resolvedProvider,
    baseUrl: baseUrl || '',
    apiKey: apiKey || '',
    model,
    messages,
    temperature,
    stream: true,
  };

  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bodyPayload),
    signal,
  });

  if (!response.ok) {
    if (response.status === 404 && isDirectExternalApi(provider, baseUrl, apiKey)) {
      return await directBrowserChatStream(options);
    }
    if (response.status === 404 && resolvedProvider === 'built-in-gemini') {
      throw new Error('当前处于纯静态部署环境，内置 Gemini 服务端不可用。请在「引擎与技能」中切换至 DeepSeek / 硅基流动等国内直连线路。');
    }
    const text = await response.text();
    let errorMessage = `请求失败 (${response.status})`;
    try {
      const errJson = JSON.parse(text);
      if (errJson.error) errorMessage = errJson.error;
    } catch {
      if (text) errorMessage = text.slice(0, 300);
    }
    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error('未收到服务器流式数据响应');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;

      if (trimmed.startsWith('data: ')) {
        try {
          const rawJson = trimmed.slice(6);
          const json = JSON.parse(rawJson);

          if (json.error) {
            throw new Error(json.error);
          }

          const deltaContent = json.choices?.[0]?.delta?.content;
          if (deltaContent) {
            fullContent += deltaContent;
            onChunk(deltaContent);
          }
        } catch (err: any) {
          if (err.message && !err.message.includes('JSON')) {
            throw err;
          }
        }
      }
    }
  }

  return { content: fullContent };
}

export async function streamChatCompletion(options: StreamChatOptions): Promise<{ content: string }> {
  const done = beginGlobalActivity(`AI 引擎流式创作中 (${options.model})...`);
  try {
    return await streamChatCompletionInternal(options);
  } finally {
    done();
  }
}

export async function chatCompletion(options: Omit<StreamChatOptions, 'onChunk'>): Promise<{ content: string; model: string }> {
  let accumulated = '';
  const result = await streamChatCompletion({
    ...options,
    onChunk: (chunk) => {
      accumulated += chunk;
    },
  });
  return { content: result.content || accumulated, model: options.model };
}

export async function testAndFetchModels(
  baseUrl: string,
  apiKey: string,
  provider: string = 'openai-compatible'
): Promise<Array<{ id: string; name?: string }>> {
  const done = beginGlobalActivity('正在检测 API 线路并拉取模型...');
  try {
    if (isDirectExternalApi(provider, baseUrl, apiKey)) {
      try {
        const cleanUrl = baseUrl.replace(/\/+$/, '');
        const response = await fetch(`${cleanUrl}/models`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          if (data.data && Array.isArray(data.data)) {
            return data.data.map((m: any) => ({
              id: m.id,
              name: m.id,
            }));
          }
        }
      } catch (e) {
        console.warn('Direct fetch models failed, trying proxy fallback...', e);
      }
    }

    if (provider === 'built-in-gemini' || baseUrl === '/api/ai' || !baseUrl) {
      try {
        const res = await fetch('/api/ai/models');
        if (res.ok) {
          const data = await res.json();
          return data.data || [];
        }
      } catch {
        return [
          { id: 'deepseek-chat', name: 'DeepSeek-V3 (请配置国内直连 Key)' },
          { id: 'deepseek-reasoner', name: 'DeepSeek-R1' },
        ];
      }
    }

    const queryParams = new URLSearchParams({
      provider: 'custom-openai',
      baseUrl,
      apiKey,
    });

    const response = await fetch(`/api/ai/models?${queryParams.toString()}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`无法获取模型列表（部分国内平台如火山方舟不支持自动拉取列表，您可直接手动输入模型ID使用）: ${text.slice(0, 160)}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data.data || [];
  } finally {
    done();
  }
}
