import 'dotenv/config';
import { createCorsair } from 'corsair';
import { setupCorsair } from 'corsair/setup';
import { gmail } from '@corsair-dev/gmail';
import { googlecalendar } from '@corsair-dev/googlecalendar';
import { conn } from './db';

export const corsair = createCorsair({
    plugins: [gmail(), googlecalendar()],
    database: conn,
    kek: process.env.CORSAIR_KEK!,
    multiTenancy: true,
});

let setupPromise: Promise<void> | null = null;

/** Ensures Google OAuth credentials from env are loaded before any OAuth call. */
export function ensureCorsairConfigured(): Promise<void> {
    if (setupPromise) return setupPromise;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return Promise.resolve();
    }

    setupPromise = setupCorsair(corsair, {
        credentials: {
            gmail: {
                client_id: clientId,
                client_secret: clientSecret,
            },
            googlecalendar: {
                client_id: clientId,
                client_secret: clientSecret,
            },
        },
    })
        .then(() => {
            console.log('✅ Corsair: Google OAuth credentials configured');
        })
        .catch((err: unknown) => {
            setupPromise = null;
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('unable to authenticate data')) {
                console.error(
                    '❌ Corsair: CORSAIR_KEK does not match encrypted credentials in the database. ' +
                        'Clear corsair_integrations (and related tables) or restore the original CORSAIR_KEK.',
                );
            } else {
                console.error('❌ Corsair: Failed to configure Google OAuth credentials:', err);
            }
            throw err;
        });

    return setupPromise;
}

// Kick off configuration on first server import
void ensureCorsairConfigured().catch(() => undefined);