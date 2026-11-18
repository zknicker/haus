import type { ImageGenerationProvider } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { imageGenerationKeysTable } from '../postgres/schema.ts';

export type DevelopmentImageGenerationKeys = Partial<Record<ImageGenerationProvider, string>>;

/** The development Server's own provider credentials, as the dev stack resolves them. */
export function readDevelopmentImageGenerationKeys(
    values: NodeJS.ProcessEnv
): DevelopmentImageGenerationKeys {
    return {
        gemini: values.HAUS_GEMINI_API_KEY || undefined,
        openai: values.HAUS_OPENAI_API_KEY || undefined,
    };
}

/**
 * Connects image generation on the demo Server from the dev stack's own provider
 * credentials. Idempotent and never overwrites: a key the Owner set in Settings
 * (or an earlier seed) is left untouched. The caller owns the development gate.
 * Returns the providers newly seeded; never logs or returns a key.
 */
export async function seedDevelopmentImageGenerationKeys(
    db: HausDatabase,
    input: { keys: DevelopmentImageGenerationKeys; serverId: string }
): Promise<ImageGenerationProvider[]> {
    const seeded: ImageGenerationProvider[] = [];
    for (const provider of ['openai', 'gemini'] as const) {
        const apiKey = input.keys[provider];
        if (!apiKey) {
            continue;
        }
        const inserted = await db
            .insert(imageGenerationKeysTable)
            .values({ provider, secret: { apiKey }, serverId: input.serverId })
            .onConflictDoNothing()
            .returning({ provider: imageGenerationKeysTable.provider });
        if (inserted.length > 0) {
            seeded.push(provider);
        }
    }
    if (seeded.length > 0) {
        console.info(`Seeded image generation keys: ${seeded.join(', ')}`);
    }
    return seeded;
}
