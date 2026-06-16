/**
 * Next.js Instrumentation Hook
 * Runs once on server startup to initialize Corsair with Google OAuth credentials from env.
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (clientId && clientSecret) {
      try {
        const { ensureCorsairConfigured } = await import("@/server/corsair");
        await ensureCorsairConfigured();
      } catch (err) {
        console.error("❌ Corsair: Failed to configure Google OAuth credentials", err);
      }
    } else {
      console.warn(
        "⚠️  Corsair: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set in .env — Gmail/Calendar connect will not work."
      );
    }
  }
}
