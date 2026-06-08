This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Authentication (Wave 3.1)

The app ships with secure login + RBAC fully wired but **OFF by default**
so testing can run without sign-in friction. To flip it on:

1. **Invite users first.** Sign in to the deployed app, go to
   **Admin → Access · Users**, and invite each team member. Supabase
   emails them a one-time link; they set their own password on first
   sign-in. Roles: `user` (standard), `admin` (manages team + bug
   reports + legal + access), `owner` (full access, can mint other
   owners).
2. **Set Vercel env vars:**
   - `AUTH_ENABLED=true`
   - `NEXT_PUBLIC_SITE_URL=https://<your-deployment>` (used as the
     base for Supabase Auth email-link redirects to `/auth/callback`)
3. **Redeploy.** Now every route except `/login`, `/auth/*`, and the
   shared-secret API endpoints (`/api/intake/application`,
   `/api/workflows/tick`) requires a signed-in user. Admin-only pages
   (`/access`, `/team`, `/legal`, `/bug-reports`, `/workflows`) also
   check role.

To turn auth back off: set `AUTH_ENABLED=false` and redeploy. The
synthetic Owner falls back in and no login is required.

Implementation:
- Login page: `src/app/login/`
- Auth callback: `src/app/auth/callback/route.ts`
- User management: `src/app/access/`
- Server helpers: `src/lib/auth.server.ts`, `src/lib/users.server.ts`
- Edge middleware: `src/proxy.ts`
- Schema: `supabase/migrations/0017_rbac.sql` (profiles table + trigger)

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
