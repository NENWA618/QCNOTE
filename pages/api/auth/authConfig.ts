import { type Account, type NextAuthOptions, type Profile, type User } from 'next-auth';
import { type AdapterUser } from 'next-auth/adapters';
import { type JWT } from 'next-auth/jwt';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import DiscordProvider from 'next-auth/providers/discord';
import CredentialsProvider from 'next-auth/providers/credentials';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../../lib/env-config';
import {
  CALLBACK_URL_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  USE_SECURE_COOKIES,
} from '../../../lib/authCookies';
import { INTERNAL_TOKEN_HEADER, getInternalApiToken } from '../../../lib/internalAuth';

type SessionUserWithId = {
  id?: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

type ExtendedJWT = {
  id?: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  provider?: string | null;
  sub?: string;
  iat?: number;
  exp?: number;
  /** 登录时间（毫秒），之后刷新令牌时保持不变；用来判断会话是否早于账号注销 */
  signedInAt?: number;
  /**
   * 登录会话 ID。一个账号同一时间只有一个有效会话：每次登录都生成新的 sid 并登记到后端，
   * 令牌里的 sid 不是后端登记的那个，这个会话就作废。
   */
  sid?: string;
  /** 上次向后端确认会话仍然有效（未注销、未被新登录顶掉）的时间（毫秒） */
  revocationCheckedAt?: number;
};

const NEXTAUTH_SECRET = env.NEXTAUTH_SECRET;

// 账号在别的设备上注销、或在别处重新登录后，这里最多晚这么久才把会话清掉；
// 期间后端已经拒绝这个会话的请求
const REVOCATION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * 登录时向后端登记这个账号唯一有效的会话 ID，之前登录的会话随即作废。
 * 没有配置后端时跳过（本地开发）；配置了但登记失败就抛错让这次登录失败，
 * 否则新会话会被后端当成“旧会话”拒绝，而旧会话反而继续有效。
 */
async function registerActiveSession(userId: string, sessionId: string): Promise<void> {
  const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '');
  const internalToken = getInternalApiToken(NEXTAUTH_SECRET);
  if (!backendUrl || !internalToken) {
    console.warn('BACKEND_URL not configured; skipping single-session registration');
    return;
  }
  const response = await fetch(`${backendUrl}/api/ugc/session/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [INTERNAL_TOKEN_HEADER]: internalToken },
    body: JSON.stringify({ userId, sessionId }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Failed to register session (${response.status})`);
  }
}

/** 向后端确认会话是否已失效（账号注销或被新登录顶掉）；后端不可用时返回 null（暂不判断，下次再查）。 */
async function isSessionRevoked(token: ExtendedJWT): Promise<boolean | null> {
  const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '');
  const internalToken = getInternalApiToken(NEXTAUTH_SECRET);
  if (!backendUrl || !internalToken || !token.id) return null;
  try {
    const response = await fetch(`${backendUrl}/api/ugc/session/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [INTERNAL_TOKEN_HEADER]: internalToken },
      body: JSON.stringify({
        userId: token.id,
        signedInAt: token.signedInAt,
        sessionId: token.sid,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { revoked?: unknown };
    return typeof data.revoked === 'boolean' ? data.revoked : null;
  } catch (error) {
    console.warn('Failed to check session revocation:', error);
    return null;
  }
}

// 部分 provider（如 GitHub）的 profile 用 id 而不是 sub，且可能是数字
type ProviderProfile = Profile & { id?: string | number };

function getStableUserId(
  user: User | AdapterUser | undefined,
  account: Account | null | undefined,
  profile: ProviderProfile | undefined,
  token: JWT,
): string {
  const providerAccountId = account?.providerAccountId;
  const profileId = profile?.sub || profile?.id;
  const provider = account?.provider;

  return (
    user?.id ||
    (provider && providerAccountId ? `${provider}:${providerAccountId}` : undefined) ||
    (profileId ? String(profileId) : undefined) ||
    token.sub ||
    uuidv4()
  );
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
    }),
    GitHubProvider({
      clientId: env.GITHUB_CLIENT_ID || '',
      clientSecret: env.GITHUB_CLIENT_SECRET || '',
    }),
    DiscordProvider({
      clientId: env.DISCORD_CLIENT_ID || '',
      clientSecret: env.DISCORD_CLIENT_SECRET || '',
    }),
    // 仅本地开发注册测试登录，生产环境登录页不会出现这个入口
    ...(process.env.NODE_ENV === 'development'
      ? [
          CredentialsProvider({
            id: 'test',
            name: 'Test Login',
            credentials: {
              username: { label: 'Username', type: 'text' },
            },
            async authorize(credentials: Record<string, string> | undefined) {
              // 双重保险：即使 provider 被意外注册，非开发环境也拒绝登录
              if (process.env.NODE_ENV !== 'development') {
                return null;
              }
              if (!credentials?.username) {
                return null;
              }
              const normalizedUsername = credentials.username.trim().toLowerCase();
              return {
                id: `dev-user:${normalizedUsername}`,
                name: credentials.username,
                email: `${normalizedUsername}@test.local`,
              };
            },
          }),
        ]
      : []),
  ],

  callbacks: {
    async jwt({ token, user, account, profile }): Promise<ExtendedJWT> {
      const typedToken = token as ExtendedJWT;
      if (user) {
        typedToken.id = getStableUserId(user, account, profile, token);
        typedToken.email = user.email;
        typedToken.name = user.name;
        typedToken.image = user.image;
        typedToken.provider = account?.provider;
        typedToken.signedInAt = Date.now();
        typedToken.revocationCheckedAt = typedToken.signedInAt;
        // 每次登录都是一个新会话：登记之后，这个账号之前的会话全部作废
        typedToken.sid = uuidv4();
        await registerActiveSession(typedToken.id, typedToken.sid);
        return typedToken;
      }
      if (!typedToken.id) {
        typedToken.id = token.sub;
      }
      if (Date.now() - (typedToken.revocationCheckedAt ?? 0) > REVOCATION_CHECK_INTERVAL_MS) {
        const revoked = await isSessionRevoked(typedToken);
        // 抛错时 NextAuth 会清掉会话 cookie，客户端随之变为未登录
        if (revoked) throw new Error('Session revoked: account deleted or signed in elsewhere');
        if (revoked === false) typedToken.revocationCheckedAt = Date.now();
      }
      return typedToken;
    },

    async session({ session, token }) {
      if (session.user) {
        const user = session.user as SessionUserWithId;
        const typedToken = token as ExtendedJWT;
        user.id = typedToken.id;
        user.email = typedToken.email;
        user.name = typedToken.name;
        user.image = typedToken.image;
      }
      return session;
    },

    async signIn({ user, account, profile }) {
      try {
        // 直连后端并携带服务间令牌：此时用户还没有会话，且后端不再接受匿名的 user/init
        const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '');
        const internalToken = getInternalApiToken(NEXTAUTH_SECRET);
        if (!backendUrl || !internalToken) {
          console.warn('BACKEND_URL not configured; skipping user initialization');
          return true;
        }
        const userId = getStableUserId(user, account, profile, {} as JWT);
        const username = user.name || user.email?.split('@')[0] || 'user';
        const email = user.email || `${username}@${account?.provider || 'local'}.local`;

        const response = await fetch(`${backendUrl}/api/ugc/user/init`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [INTERNAL_TOKEN_HEADER]: internalToken,
          },
          body: JSON.stringify({
            userId,
            email,
            username,
          }),
        });

        if (!response.ok) {
          console.error('Failed to initialize user:', await response.text());
        } else {
          console.log('User initialized successfully');
        }
      } catch (error) {
        console.error('Error initializing user:', error);
      }

      return true;
    },

    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      // 允许回调到相对URL
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      // 仅允许来自相同来源的回调
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },

  pages: {
    signIn: '/signin',
    error: '/signin',
  },

  secret: NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  jwt: {
    secret: NEXTAUTH_SECRET,
    maxAge: 30 * 24 * 60 * 60,
  },

  debug: process.env.NODE_ENV === 'development',

  cookies: {
    sessionToken: {
      name: SESSION_COOKIE_NAME,
      options: {
        httpOnly: true,
        secure: USE_SECURE_COOKIES,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      },
    },
    callbackUrl: {
      name: CALLBACK_URL_COOKIE_NAME,
      options: {
        httpOnly: true,
        secure: USE_SECURE_COOKIES,
        sameSite: 'lax',
        path: '/',
        maxAge: 15 * 60,
      },
    },
    csrfToken: {
      name: CSRF_COOKIE_NAME,
      options: {
        httpOnly: true,
        secure: USE_SECURE_COOKIES,
        sameSite: 'lax',
        path: '/',
      },
    },
  },
};
