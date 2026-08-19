import { NextAuthOptions } from 'next-auth'
import FacebookProvider from 'next-auth/providers/facebook'
import { prisma } from '@/lib/db'

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  providers: [
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            'ads_management',
            'ads_read',
            'business_management',
            'pages_read_engagement',
          ].join(','),
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token
        try {
          const user = await prisma.user.upsert({
            where: { facebookId: account.providerAccountId },
            update: { accessToken: account.access_token as string },
            create: {
              facebookId: account.providerAccountId,
              name: token.name,
              image: token.picture as string,
              accessToken: account.access_token as string,
            },
          })
          token.dbUserId = user.id
        } catch (e) {
          console.error('[auth] prisma upsert failed:', e)
          try {
            const existing = await prisma.user.findUnique({ where: { facebookId: account.providerAccountId } })
            token.dbUserId = existing?.id ?? token.sub
          } catch {
            token.dbUserId = token.sub
          }
        }
      }
      // If dbUserId fell back to Facebook sub (not a cuid), try to recover the real DB id
      if (token.sub && token.dbUserId === token.sub) {
        try {
          const user = await prisma.user.findUnique({ where: { facebookId: token.sub } })
          if (user) token.dbUserId = user.id
        } catch { /* keep existing */ }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.dbUserId as string) || token.sub!
        session.accessToken = token.accessToken as string
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
}
