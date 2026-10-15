import type { LinearWriteTargetType } from '@haus/api';
import {
    type LinearCallMeta,
    type LinearMutation,
    linearClientEntityId,
} from '@haus/api/linear-actor-meta';
import { LinearAlreadyExistsError, type LinearGraphql } from './linear-graphql.ts';
import { inputError } from './tool-error.ts';

/** Everything one `tools/call` may use. Nothing here outlives the call. */
export interface LinearCallContext {
    fetch: typeof fetch;
    linear: LinearGraphql;
    meta: LinearCallMeta;
    mutations: LinearMutation[];
    signal: AbortSignal;
}

interface MutatedEntity {
    id: string;
    updatedAt?: string | null;
}

/**
 * Runs one create with the request's derived client id. Linear refuses a
 * repeated id with "already exists"; that means an earlier attempt of this
 * same request landed, so the entity is read back and reported as the result.
 */
export async function createOnce<T extends MutatedEntity>(
    context: LinearCallContext,
    options: {
        create: (id: string) => Promise<T | null>;
        entityType: LinearWriteTargetType;
        fields: Record<string, unknown>;
        opIndex: number;
        readBack: (id: string) => Promise<T | null>;
    }
): Promise<T> {
    const clientId = linearClientEntityId(context.meta.idSeed, options.opIndex);
    let entity: T | null;
    let replayed = false;
    try {
        entity = await options.create(clientId);
    } catch (cause) {
        if (!(cause instanceof LinearAlreadyExistsError)) {
            throw cause;
        }
        replayed = true;
        // "already exists" can also be a name collision; then our id holds nothing.
        entity = await options.readBack(clientId).catch(() => null);
        if (!entity) {
            throw cause;
        }
    }
    if (!entity) {
        throw inputError('Linear did not create the entity.');
    }
    context.mutations.push({
        clientId,
        created: true,
        entityId: entity.id,
        entityType: options.entityType,
        fields: options.fields,
        opIndex: options.opIndex,
        replayed,
        updatedAt: entity.updatedAt ?? null,
    });
    return entity;
}

/** Records a non-create mutation that Linear confirmed. */
export function recordUpdate(
    context: LinearCallContext,
    options: {
        entity: MutatedEntity;
        entityType: LinearWriteTargetType;
        fields: Record<string, unknown>;
        opIndex: number;
    }
) {
    context.mutations.push({
        clientId: null,
        created: false,
        entityId: options.entity.id,
        entityType: options.entityType,
        fields: options.fields,
        opIndex: options.opIndex,
        replayed: false,
        updatedAt: options.entity.updatedAt ?? null,
    });
}

/** `createAsUser` and `displayIconUrl` ride only workspace-actor issue and comment creates. */
export function attribution(meta: LinearCallMeta): Record<string, string> {
    if (meta.actor.kind !== 'workspace') {
        return {};
    }
    return {
        ...(meta.actor.createAsUser ? { createAsUser: meta.actor.createAsUser } : {}),
        ...(meta.actor.displayIconUrl ? { displayIconUrl: meta.actor.displayIconUrl } : {}),
    };
}

/** Linear answers `{ success, <entity> }`; a false success is Linear refusing the input. */
export function confirmed<T>(payload: { success: boolean } & Record<string, unknown>, key: string) {
    if (!payload.success) {
        throw inputError('Linear refused the change.');
    }
    return (payload[key] ?? null) as T | null;
}

/** Drops absent optional inputs so a mutation sends, and fingerprints, only what changed. */
export function definedFields(input: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
