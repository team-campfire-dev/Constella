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

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Deployment Configuration

When deploying to a VM or production environment, you must configure the environment variables correctly in your `.env` file (or `docker-compose.yml`).

### Critical Settings for Login

- **`NEXTAUTH_URL`**: This **MUST** be set to your application's public URL (e.g., `https://your-domain.com` or `http://your-vm-ip:3000`).
  - If you leave this as `localhost`, users will be redirected to *their own* localhost after logging in, which will fail.
- **`NEXTAUTH_SECRET`**: Set this to a random string for session encryption. You can generate one with `openssl rand -base64 32`.

### Database Connection (Docker to Host)

If your database is running on the Host machine (outside Docker), you cannot use `localhost` in your `DATABASE_URL`.
- Use `host.docker.internal` (if configured in docker-compose) or the Docker Gateway IP (`172.17.0.1`).
- Example: `DATABASE_URL="mysql://user:pass@host.docker.internal:3306/db_name"`

### Google OAuth

Ensure your Google Cloud Console Credentials allow the correct redirect URI:
- **Authorized redirect URIs**: `http://<YOUR_DOMAIN_OR_IP>:3000/api/auth/callback/google`
