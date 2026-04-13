import { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import DiscordProvider from "next-auth/providers/discord";
import CredentialsProvider from "next-auth/providers/credentials";
import { v4 as uuidv4 } from "uuid";

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
};

const NEXTAUTH_URL = process.env.NEXTAUTH_URL || "https://www.qcnote.com";
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "your-secret-key-change-in-production";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      allowDangerousEmailAccountLinking: true,
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
      allowDangerousEmailAccountLinking: true,
    }),
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID || "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
      allowDangerousEmailAccountLinking: true,
    }),
    CredentialsProvider({
      // 允许本地开发测试
      id: "test",
      name: "Test Login",
      credentials: {
        username: { label: "Username", type: "text" },
      },
      async authorize(credentials) {
        if (process.env.NODE_ENV !== "development") {
          return null;
        }
        if (!credentials?.username) {
          return null;
        }
        return {
          id: uuidv4(),
          name: credentials.username,
          email: `${credentials.username}@test.local`,
          image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${credentials.username}`,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, account }): Promise<ExtendedJWT> {
      const typedToken = token as ExtendedJWT;
      if (user) {
        typedToken.id = user.id || uuidv4();
        typedToken.email = user.email;
        typedToken.name = user.name;
        typedToken.image = user.image;
        typedToken.provider = account?.provider;
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

    async redirect({ url, baseUrl }) {
      // 允许回调到相对URL
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // 仅允许来自相同来源的回调
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },

    async signIn({ user, account, profile }) {
      try {
        // 初始化用户资料到数据库
        const response = await fetch(`${process.env.NEXTAUTH_URL}/api/ugc/user/init`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: user.id,
            email: user.email,
            username: user.name || user.email?.split('@')[0] || 'user',
          }),
        });

        if (!response.ok) {
          console.error('Failed to initialize user:', await response.text());
          // 仍然允许登录，但记录错误
        } else {
          console.log('User initialized successfully');
        }
      } catch (error) {
        console.error('Error initializing user:', error);
        // 仍然允许登录
      }

      return true;
    },
  },

  pages: {
    signIn: "/signin",
    error: "/signin",
  },

  secret: NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  jwt: {
    secret: NEXTAUTH_SECRET,
    maxAge: 30 * 24 * 60 * 60,
  },

  debug: process.env.NODE_ENV === "development",
};
