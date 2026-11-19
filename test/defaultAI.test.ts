import { describe, expect, it } from 'vitest';
import { getDefaultAIConfig, parseModels } from '../lib/defaultAI';
import { buildAIRequest, callAI } from '../lib/aiClient';
import { DEFAULT_AI_ENDPOINT } from '../lib/defaultAI';

describe('getDefaultAIConfig', () => {
  const full = {
    DEFAULT_AI_BASE_URL: 'https://relay.test/v1/',
    DEFAULT_AI_API_KEY: 'sk-secret',
    DEFAULT_AI_MODELS: 'a|模型A, b ,a',
  } as unknown as NodeJS.ProcessEnv;

  it('完整配置：去掉地址末尾斜杠、模型去重并支持显示名', () => {
    const c = getDefaultAIConfig(full)!;
    expect(c.baseUrl).toBe('https://relay.test/v1');
    expect(c.models).toEqual([
      { id: 'a', label: '模型A' },
      { id: 'b', label: 'b' },
    ]);
    expect(c.rateLimitPerMinute).toBe(10);
  });

  it.each(['DEFAULT_AI_BASE_URL', 'DEFAULT_AI_API_KEY', 'DEFAULT_AI_MODELS'])(
    '缺少 %s 就视为未启用',
    (k) => {
      expect(getDefaultAIConfig({ ...full, [k]: '' } as unknown as NodeJS.ProcessEnv)).toBeNull();
    },
  );

  it('非 http(s) 地址视为未启用', () => {
    expect(
      getDefaultAIConfig({
        ...full,
        DEFAULT_AI_BASE_URL: 'ftp://x',
      } as unknown as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it('parseModels 空值返回空数组', () => {
    expect(parseModels(undefined)).toEqual([]);
  });
});

describe('默认模型代理调用', () => {
  it('不带 Key：请求头里没有 Authorization', () => {
    const req = buildAIRequest({
      apiEndpoint: DEFAULT_AI_ENDPOINT,
      apiKey: '',
      modelName: 'a',
      prompt: 'hi',
    });
    expect(req.headers.Authorization).toBeUndefined();
  });

  it('走代理地址时允许空 Key；自定义地址仍要求 Key', async () => {
    await expect(
      callAI({
        apiEndpoint: 'https://x.test/v1/chat/completions',
        apiKey: '',
        modelName: 'a',
        prompt: 'hi',
      }),
    ).rejects.toThrow('请先填写');
  });
});
