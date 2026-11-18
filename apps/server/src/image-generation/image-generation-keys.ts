import {
    type ImageGenerationKeyRemoveInput,
    type ImageGenerationKeySetInput,
    type ImageGenerationProvider,
    type ImageGenerationProviderStatus,
    type ImageGenerationSettings,
    imageGenerationProviders,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { imageGenerationKeysTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { ImageGenerationSettingsDeniedError } from './image-generation-errors.ts';
import { imageGenerationModelsFor } from './image-generation-registry.ts';

type Reader = Pick<HausDatabase, 'select'>;

/**
 * The Server Owner's own provider keys. No function here returns a key to a
 * caller outside Server image generation: reads expose connection state and
 * `updatedAt` only; `readImageGenerationKey` serves the provider adapters.
 */

/** Every provider, in registry order, with whether the Owner has connected it. */
export async function readImageGenerationSettings(
    db: Reader,
    member: HausUser | null,
    serverId: string
): Promise<ImageGenerationSettings> {
    await requireOwner(db, member, serverId);
    return { providers: await readProviderStatuses(db, serverId) };
}

/** Adds or replaces the provider's key and returns that provider's new status. */
export async function setImageGenerationKey(
    db: HausDatabase,
    member: HausUser | null,
    input: ImageGenerationKeySetInput
): Promise<ImageGenerationProviderStatus> {
    await requireOwner(db, member, input.serverId);
    await db
        .insert(imageGenerationKeysTable)
        .values({
            provider: input.provider,
            secret: { apiKey: input.apiKey },
            serverId: input.serverId,
        })
        .onConflictDoUpdate({
            set: { secret: { apiKey: input.apiKey }, updatedAt: new Date() },
            target: [imageGenerationKeysTable.serverId, imageGenerationKeysTable.provider],
        });
    return await readProviderStatus(db, input.serverId, input.provider);
}

/** Deletes the provider's key and returns that provider's new status. */
export async function removeImageGenerationKey(
    db: HausDatabase,
    member: HausUser | null,
    input: ImageGenerationKeyRemoveInput
): Promise<ImageGenerationProviderStatus> {
    await requireOwner(db, member, input.serverId);
    await db
        .delete(imageGenerationKeysTable)
        .where(
            and(
                eq(imageGenerationKeysTable.serverId, input.serverId),
                eq(imageGenerationKeysTable.provider, input.provider)
            )
        );
    return await readProviderStatus(db, input.serverId, input.provider);
}

/** The providers whose key this Server holds. Never returns a key. */
export async function readConnectedImageProviders(
    db: Reader,
    serverId: string
): Promise<Map<ImageGenerationProvider, Date>> {
    const rows = await db
        .select({
            provider: imageGenerationKeysTable.provider,
            updatedAt: imageGenerationKeysTable.updatedAt,
        })
        .from(imageGenerationKeysTable)
        .where(eq(imageGenerationKeysTable.serverId, serverId));
    return new Map(rows.map((row) => [row.provider, row.updatedAt]));
}

/** The one read that returns a key: for the provider adapters, never an API response. */
export async function readImageGenerationKey(
    db: Reader,
    serverId: string,
    provider: ImageGenerationProvider
): Promise<string | null> {
    const [row] = await db
        .select({ secret: imageGenerationKeysTable.secret })
        .from(imageGenerationKeysTable)
        .where(
            and(
                eq(imageGenerationKeysTable.serverId, serverId),
                eq(imageGenerationKeysTable.provider, provider)
            )
        )
        .limit(1);
    return row?.secret.apiKey ?? null;
}

async function readProviderStatuses(
    db: Reader,
    serverId: string
): Promise<ImageGenerationProviderStatus[]> {
    const connected = await readConnectedImageProviders(db, serverId);
    return imageGenerationProviders.map((provider) => {
        const updatedAt = connected.get(provider);
        return {
            connected: updatedAt !== undefined,
            models: imageGenerationModelsFor(provider),
            provider,
            updatedAt: updatedAt?.toISOString() ?? null,
        };
    });
}

async function readProviderStatus(
    db: Reader,
    serverId: string,
    provider: ImageGenerationProvider
): Promise<ImageGenerationProviderStatus> {
    const statuses = await readProviderStatuses(db, serverId);
    const status = statuses.find((candidate) => candidate.provider === provider);
    if (!status) {
        throw new Error(`Unknown image provider ${provider}.`);
    }
    return status;
}

async function requireOwner(db: Reader, member: HausUser | null, serverId: string) {
    const server = await requireServerMembership(db, member, serverId);
    if (server.role !== 'owner') {
        throw new ImageGenerationSettingsDeniedError();
    }
}
