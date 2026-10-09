import { z } from 'zod';

// Environment variables schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXTAUTH_URL: z.string().url().default('https://www.qcnote.com'),
  NEXTAUTH_SECRET: z.string().min(1, 'NEXTAUTH_SECRET is required').optional(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required').optional(),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required').optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DEVICE_SESSION_SECRET: z.string().optional(),
  // Add other required env vars as needed
});

const INSECURE_SECRETS = new Set([
  'development-secret',
  'your-secret-key-change-in-production',
  'qcnote-device-session-secret',
]);

// 真正的生产运行时才强制要求强密钥：`next build` 阶段不需要真实密钥。
// 刻意不看 `CI` 环境变量：它可能被部署平台误带进运行时，那样会静默回退到公开的
// 默认密钥，任何人都能伪造会话。CI 的 e2e 通过 ALLOW_INSECURE_SECRETS 显式声明。
const enforceSecrets =
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build' &&
  process.env.ALLOW_INSECURE_SECRETS !== 'true';

function resolveSecret(value: string | undefined): string {
  if (enforceSecrets) {
    if (!value || value.length < 16 || INSECURE_SECRETS.has(value)) {
      throw new Error(
        'NEXTAUTH_SECRET must be set to a strong random value (>=16 chars) in production. Generate one with: openssl rand -base64 32',
      );
    }
    return value;
  }
  return value || 'development-secret';
}

// Validate environment variables
let env: Omit<z.infer<typeof envSchema>, 'NEXTAUTH_SECRET'> & { NEXTAUTH_SECRET: string };

try {
  const parsed = envSchema.parse(process.env);
  env = { ...parsed, NEXTAUTH_SECRET: resolveSecret(parsed.NEXTAUTH_SECRET) };
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Invalid environment variables:', error.issues);
    throw new Error('Invalid environment configuration');
  }
  throw error;
}

export { env };
