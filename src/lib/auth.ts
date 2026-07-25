import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/validations/auth";
import { AUTH_LIMITS, rateLimit, resetRateLimit } from "@/lib/rate-limit";

const providers: Provider[] = [
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const parsed = loginSchema.safeParse(credentials);
      if (!parsed.success) return null;

      // F39 — freno al brute force PRIMA di toccare il database: vale anche
      // per le POST dirette all'endpoint credentials, non solo per il form.
      const email = parsed.data.email.toLowerCase();
      if (!rateLimit(`login:${email}`, AUTH_LIMITS.login).allowed) return null;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.passwordHash) return null;

      const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!valid) return null;

      // Login riuscito: i tentativi legittimi non pesano sul contatore.
      resetRateLimit(`login:${email}`);
      return { id: user.id, email: user.email, name: user.name, image: user.image };
    },
  }),
];

// Google attivo solo se le credenziali OAuth sono configurate nell'env.
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id;
      return session;
    },
  },
});
