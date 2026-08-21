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
            'pages_show_list',
            'pages_read_engagement',
            'pages_read_user_content',
            // Comments on unpublished ad posts are not served by the read-only
            // page permissions alone
            'pages_manage_posts',
            'pages_manage_engagement',
            'pages_manage_ads',
            'instagram_basic',
            'instagram_manage_comments',
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
