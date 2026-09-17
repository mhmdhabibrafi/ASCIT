import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, clearRateLimit } from "@/lib/rate-limit";
import { normalizePermissions } from "@/lib/permissions";

const nextAuthSecret = process.env.NEXTAUTH_SECRET;

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 10
  },
  pages: {
    signIn: "/login"
  },
  providers: [
    CredentialsProvider({
      name: "ASCIT Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, request) {
        let email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password ?? "";
        if (!email || !password) return null;

        if (!email.includes("@")) {
          email = `${email}@ascit.local`;
        }

        const forwardedFor = request.headers?.["x-forwarded-for"];
        const clientIp = String(Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor || request.headers?.["x-real-ip"] || "unknown").split(",")[0].trim();
        const ipAttempt = checkRateLimit(`login-ip:${clientIp}`, 30, 15 * 60 * 1000);
        const accountAttempt = checkRateLimit(`login:${clientIp}:${email}`, 8, 15 * 60 * 1000);
        if (!ipAttempt.allowed || !accountAttempt.allowed) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { role: true }
        });

        if (!user || !user.isActive) return null;
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;
        clearRateLimit(`login:${clientIp}:${email}`);

        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: "LOGIN",
            module: "Autentikasi",
            description: `${user.name} login ke ASCIT.`
          }
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role.name
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id);
        const currentUser = token.id ? await prisma.user.findUnique({ where: { id: String(token.id) }, select: { role: { select: { name: true, permissions: true } } } }) : null;
        session.user.role = currentUser?.role.name || String(token.role);
        session.user.permissions = currentUser ? normalizePermissions(currentUser.role.permissions, currentUser.role.name) : [];
      }
      return session;
    }
  },
  events: {
    async signOut({ token }) {
      if (!token?.id) return;
      try {
        await prisma.auditLog.create({
          data: {
            userId: String(token.id),
            action: "LOGOUT",
            module: "Autentikasi",
            description: "Pengguna logout dari ASCIT."
          }
        });
      } catch {
        // user might have been deleted, ignore
      }
    }
  },
  secret: nextAuthSecret
};
