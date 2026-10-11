/**
 * AI 模型调用 - 直接从浏览器发起，不经过 QCNOTE 自己的后端。
 *
 * API Key 全程只存在于本地（见 aiSettings.ts）和这一次请求里，QCNOTE 服务器
 * 不会看到它。目前只支持 OpenAI 兼容的 Chat Completions 接口格式。
 */

export interface ChatCompletionParams {
  apiEndpoint: string;
  apiKey: string;
  modelName: string;
  prompt: string;
}

export async function callChatCompletion({
  apiEndpoint,
  apiKey,
  modelName,
  prompt,
}: ChatCompletionParams): Promise<string> {
  if (!apiEndpoint || !apiKey || !modelName) {
    throw new Error('请先填写并保存 API 地址、API Key 和模型名称');
  }

  let response: Response;
  try {
    response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (e) {
    throw new Error(
      `请求发送失败，请检查 API 地址是否正确、目标服务是否允许跨域访问（CORS）：${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `请求失败：${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 200)}` : ''}`,
    );
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content) {
    throw new Error(
      '响应格式不符合预期（未找到 choices[0].message.content）。当前仅支持 OpenAI 兼容的 Chat Completions 接口。',
    );
  }
  return content;
}
