// Loads the monorepo root .env so NEXT_PUBLIC_* vars live in one place
// alongside the backend's keys. On Vercel there is no root .env — env vars
// come from the project settings — so this must never crash the build.
try {
  require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
} catch {
  // dotenv unavailable or .env missing — rely on process.env (Vercel)
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_BACKEND_API_URL: process.env.NEXT_PUBLIC_BACKEND_API_URL,
  },
};
module.exports = nextConfig;

// Deployed on Vercel with root directory apps/dashboard
// (env vars are provided by Vercel project settings in production)
