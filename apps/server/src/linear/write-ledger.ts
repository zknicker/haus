import { createHash } from 'node:crypto';
import type { LinearWriteStatus, LinearWriteTargetType } from '@haus/api';
import {
    type LinearMutation,
    linearCallResultMetaSchema,
    linearClientEntityId,
    linearToolNameSchema,
    linearToolPolicies,
} from '@haus/api/linear-actor-meta';
import { and, asc, eq, lt } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { linearWritesTable } from '../postgres/schema.ts';

// The write ledger (specs/linear-app.md#write-ledger): one row per mutation op
// of a connector write, keyed by `(workspace, request id, op index)`. Pending
// rows exist before the call, so a create's derived Linear id is known before
// Linear sees it; the connector's result `_meta` settles them afterwards.

/** One connector write as the ledger needs it; a subset of the transport's write call. */
export interface LinearLedgerWrite {
    actor: { credentialId: string };
    agentId: string;
    arguments: Record<string, unknown>;
    idSeed: string;
    requestId: string;
    serverId: string;
    tool: string;
    workspaceId: string;
}

/** The connector's tool result as the transport received it. */
export interface LinearLedgerResult {
    content?: unknown;
    isError?: unknown;
    structuredContent?: unknown;
}

export type LinearWriteBegin =
    | { kind: 'proceed' }
    /** The request already succeeded; this is its recorded tool result. */
    | { kind: 'replay'; result: LinearLedgerResult };

const resultLimitBytes = 8192;
const retentionMs = 30 * 24 * 60 * 60_000;
const emptyFingerprint = createHash('sha256').update('').digest('hex');

/** Writes the request's pending rows, or answers with the result a succeeded attempt recorded. */
export async function beginLinearWrite(
    db: HausDatabase,
    write: LinearLedgerWrite
): Promise<LinearWriteBegin> {
    const [first] = await requestRows(db, write);
    if (first?.status === 'succeeded') {
        return { kind: 'replay', result: replayResult(first.result) };
    }
    const values = plannedOps(write).map((op) => ({
        agentId: write.agentId,
        clientEntityId: op.creates ? linearClientEntityId(write.idSeed, op.opIndex) : null,
        credentialId: write.actor.credentialId,
        fieldFingerprint: emptyFingerprint,
        id: createOpaqueId('lnl'),
        opIndex: op.opIndex,
        requestId: write.requestId,
        serverId: write.serverId,
        status: 'pending' as const,
        targetId: targetId(write),
        targetType: op.entity,
        tool: write.tool,
        workspaceId: write.workspaceId,
    }));
    // A resend keeps its rows; the same seed derives the same Linear ids.
    await db.insert(linearWritesTable).values(values).onConflictDoNothing();
    return { kind: 'proceed' };
}

/** Settles the request's rows from the connector's result and its reported mutations. */
export async function completeLinearWrite(
    db: HausDatabase,
    write: LinearLedgerWrite,
    result: LinearLedgerResult,
    resultMeta: unknown
) {
    const report = linearCallResultMetaSchema.safeParse(resultMeta);
    const mutations = report.success ? report.data.mutations : [];
    const status = writeStatus(result, report.success ? report.data.completed : false);
    const now = new Date();
    await db.transaction(async (tx) => {
        for (const mutation of mutations) {
            await tx
                .insert(linearWritesTable)
                .values({ ...rowFor(write, mutation), id: createOpaqueId('lnl') })
                .onConflictDoUpdate({
                    set: rowFor(write, mutation),
                    target: [
                        linearWritesTable.workspaceId,
                        linearWritesTable.requestId,
                        linearWritesTable.opIndex,
                    ],
                });
        }
        const recorded = status === 'succeeded' ? boundResult(result.structuredContent) : null;
        for (const row of await requestRows(tx, write)) {
            await tx
                .update(linearWritesTable)
                .set({
                    completedAt: status === 'unknown' ? null : now,
                    // Op 0 carries the tool result; other ops only their own outcome.
                    result: row.opIndex === 0 ? recorded : status === 'succeeded' ? {} : null,
                    status,
                })
                .where(eq(linearWritesTable.id, row.id));
        }
    });
}

/** The ledger's 30-day retention, for the hourly sweep. */
export async function deleteExpiredLinearWrites(db: HausDatabase, now: Date) {
    await db
        .delete(linearWritesTable)
        .where(lt(linearWritesTable.createdAt, new Date(now.getTime() - retentionMs)));
}

/**
 * The transport's write hooks: replay a succeeded request, otherwise plan its
 * rows and merge any per-tool `_meta` (an upload source) before the call.
 */
export function createLinearWriteLedgerHooks(dependencies: {
    db: HausDatabase;
    extraMeta?: (write: LinearLedgerWrite) => Promise<Record<string, unknown> | undefined>;
}) {
    return {
        async begin(write: LinearLedgerWrite) {
            const begun = await beginLinearWrite(dependencies.db, write);
            if (begun.kind === 'replay') {
                return { recorded: begun.result };
            }
            return { meta: await dependencies.extraMeta?.(write) };
        },
        async complete(
            input: LinearLedgerWrite & { result: LinearLedgerResult; resultMeta: unknown }
        ) {
            await completeLinearWrite(dependencies.db, input, input.result, input.resultMeta);
        },
    };
}

function writeStatus(result: LinearLedgerResult, completed: boolean): LinearWriteStatus {
    if (result.isError !== true) {
        return completed ? 'succeeded' : 'unknown';
    }
    const code = errorCode(result.structuredContent);
    // A deadline or network failure may have landed a mutation: resend with the same seed.
    return code === 'linear_upstream_error' || code === null ? 'unknown' : 'failed';
}

function rowFor(write: LinearLedgerWrite, mutation: LinearMutation) {
    return {
        agentId: write.agentId,
        clientEntityId: mutation.clientId,
        credentialId: write.actor.credentialId,
        fieldFingerprint: fingerprint(mutation.fields),
        opIndex: mutation.opIndex,
        requestId: write.requestId,
        resultEntityId: mutation.entityId,
        resultUpdatedAt: mutation.updatedAt ? new Date(mutation.updatedAt) : null,
        serverId: write.serverId,
        // Settled with its result in the same transaction; `succeeded` requires one.
        status: 'pending' as const,
        targetId: targetId(write),
        targetType: mutation.entityType,
        tool: write.tool,
        workspaceId: write.workspaceId,
    };
}

/** SHA-256 of the sorted changed fields and their values. */
export function fingerprint(fields: Record<string, unknown>): string {
    const sorted = Object.keys(fields)
        .sort()
        .map((key) => [key, fields[key]]);
    return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

function plannedOps(write: LinearLedgerWrite) {
    const tool = linearToolNameSchema.safeParse(write.tool);
    const policy = tool.success ? linearToolPolicies[tool.data] : null;
    if (!policy || policy.kind === 'read' || policy.kind === 'self') {
        throw new Error(`Linear tool ${write.tool} is not a ledger write.`);
    }
    const ops: { creates: boolean; entity: LinearWriteTargetType; opIndex: number }[] = [
        { creates: policy.creates, entity: policy.entity, opIndex: 0 },
    ];
    if (write.tool === 'update_issue' && typeof write.arguments.note === 'string') {
        ops.push({ creates: true, entity: 'comment', opIndex: 1 });
    }
    return ops;
}

/** The entity the tool names, as the Agent named it; settled rows add Linear's own id. */
function targetId(write: LinearLedgerWrite): string | null {
    for (const key of ['issue', 'state', 'project', 'session']) {
        const value = write.arguments[key];
        if (typeof value === 'string' && value.length > 0) {
            return value;
        }
    }
    return null;
}

async function requestRows(
    db: Pick<HausDatabase, 'select'>,
    write: Pick<LinearLedgerWrite, 'requestId' | 'workspaceId'>
) {
    return await db
        .select({
            id: linearWritesTable.id,
            opIndex: linearWritesTable.opIndex,
            result: linearWritesTable.result,
            status: linearWritesTable.status,
        })
        .from(linearWritesTable)
        .where(
            and(
                eq(linearWritesTable.workspaceId, write.workspaceId),
                eq(linearWritesTable.requestId, write.requestId)
            )
        )
        .orderBy(asc(linearWritesTable.opIndex));
}

/** The tool result as stored: whole when it fits 8 KiB, else its leading text. */
function boundResult(structured: unknown): Record<string, unknown> {
    const value =
        typeof structured === 'object' && structured !== null && !Array.isArray(structured)
            ? (structured as Record<string, unknown>)
            : {};
    const text = JSON.stringify(value);
    if (Buffer.byteLength(text) <= resultLimitBytes - 64) {
        return value;
    }
    let cut = resultLimitBytes / 2;
    while (
        Buffer.byteLength(JSON.stringify({ text: text.slice(0, cut), truncated: true })) >
        resultLimitBytes
    ) {
        cut = Math.floor(cut * 0.75);
    }
    return { text: text.slice(0, cut), truncated: true };
}

function replayResult(stored: Record<string, unknown> | null): LinearLedgerResult {
    if (stored?.truncated === true && typeof stored.text === 'string') {
        return { content: [{ text: stored.text, type: 'text' }], isError: false };
    }
    const structured = stored ?? {};
    return {
        content: [{ text: JSON.stringify(structured), type: 'text' }],
        isError: false,
        structuredContent: structured,
    };
}

function errorCode(structured: unknown): string | null {
    if (typeof structured !== 'object' || structured === null || !('error' in structured)) {
        return null;
    }
    const { error } = structured;
    return typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : null;
}
