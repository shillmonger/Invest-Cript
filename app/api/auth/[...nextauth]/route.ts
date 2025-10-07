import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import clientPromise from "@/lib/mongodb";
import { compare } from "bcryptjs";
import { ObjectId } from "mongodb";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const client = await clientPromise;
        const db = client.db("crypto-investment");

        const user = await db.collection("users").findOne({ email: credentials?.email });
        console.log("Fetched user from DB:", user);

        if (!user) throw new Error("No user found with this email");

        const isValid = await compare(credentials!.password, user.passwordHash);
        if (!isValid) throw new Error("Invalid password");

        // Update lastLogin timestamp
        await db.collection("users").updateOne(
          { _id: user._id },
          { $set: { lastLogin: new Date() } }
        );

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role || "user",
        };
      },
    }),
  ],

  callbacks: {
async redirect({ url, baseUrl }) {
  try {
    const parsedUrl = new URL(url, baseUrl);

    // ✅ Prevent redirect loops by only redirecting if user is NOT already on login
    if (parsedUrl.pathname === "/auth/login") {
      return baseUrl; // go to homepage instead of forcing dashboard
    }

    // ✅ Allow only internal redirects
    if (parsedUrl.origin === baseUrl) {
      return parsedUrl.toString();
    }

    return baseUrl;
  } catch {
    return baseUrl;
  }
},



    // 🔹 Persist ID and role in JWT
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        (token as any).role = (user as any).role;
      }
      return token;
    },

    // 🔹 Enrich session from DB
    async session({ session, token }) {
      if (token) {
        try {
          const client = await clientPromise;
          const db = client.db("crypto-investment");
          const dbUser = await db
            .collection("users")
            .findOne({ _id: new ObjectId(token.id as string) });

          session.user = {
            ...session.user,
            id: token.id as string,
            role: (token as any).role as string,
            name: dbUser?.name ?? session.user?.name,
            email: dbUser?.email ?? session.user?.email,
            username: dbUser?.username || undefined,
            createdAt: dbUser?.createdAt
              ? new Date(dbUser.createdAt).toISOString()
              : undefined,
            lastLogin: dbUser?.lastLogin
              ? new Date(dbUser.lastLogin).toISOString()
              : undefined,
            avatar: dbUser?.avatar || undefined,
          } as any;
        } catch (e) {
          console.error("Session enrichment failed:", e);
          session.user = {
            ...session.user,
            id: token.id as string,
            role: (token as any).role as string,
          } as any;
        }
      }
      return session;
    },
  },

  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },

  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
