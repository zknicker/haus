import { createHash } from 'node:crypto';
import * as z from 'zod';
import { linearWriteTargetTypeSchema } from './linear.ts';

// The per-request contract between Haus Server and the stateless Linear
// connector (specs/linear-app.md#per-request-actor-transport). The Server
// resolves the actor and sends its token in `tools/call` `_meta`; the connector
// reports every Linear mutation back in the result `_meta`. Both are
// credentials or ledger evidence: never logged, echoed, or forwarded to
// Computer. Node-only (SHA-1 id hashing), so this module is a subpath export.

/** The `_meta` key both directions use. */
export const linearMetaKey = 'chat.haus/linear';

export const linearToolNames = [
    'search_issues',
    'get_issue',
    'list_comments',
    'list_teams',
    'list_projects',
    'get_project',
    'list_labels',
    'list_users',
    'list_cycles',
    'search_documents',
    'get_document',
    'list_workflow_states',
    'create_issue',
    'update_issue',
    'create_comment',
    'delegate_issue',
    'create_project',
    'create_document',
    'create_label',
    'create_workflow_state',
    'update_workflow_state',
    'archive_workflow_state',
    'upload_image',
    'reply',
    'whoami',
] as const;
export const linearToolNameSchema = z.enum(linearToolNames);
export type LinearToolName = z.infer<typeof linearToolNameSchema>;

/**
 * What each tool writes, for the ledger's pending rows. Actor selection's
 * target arguments live with the Server (`linear/target-teams.ts`).
 */
export type LinearToolPolicy =
    | { kind: 'read' }
    | { kind: 'self' }
    | {
          kind: 'session' | 'write';
          /** Whether op 0 creates an entity, so its Linear id is derived from the seed. */
          creates: boolean;
          entity: z.infer<typeof linearWriteTargetTypeSchema>;
      };

const read = { kind: 'read' } as const;

export const linearToolPolicies: Record<LinearToolName, LinearToolPolicy> = {
    search_issues: read,
    get_issue: read,
    list_comments: read,
    list_teams: read,
    list_projects: read,
    get_project: read,
    list_labels: read,
    list_users: read,
    list_cycles: read,
    search_documents: read,
    get_document: read,
    list_workflow_states: read,
    create_issue: { kind: 'write', creates: true, entity: 'issue' },
    update_issue: { kind: 'write', creates: false, entity: 'issue' },
    create_comment: { kind: 'write', creates: true, entity: 'comment' },
    delegate_issue: { kind: 'write', creates: false, entity: 'issue' },
    create_project: { kind: 'write', creates: true, entity: 'project' },
    create_document: { kind: 'write', creates: true, entity: 'document' },
    create_label: { kind: 'write', creates: true, entity: 'label' },
    create_workflow_state: {
        kind: 'write',
        creates: true,
        entity: 'workflow_state',
    },
    update_workflow_state: {
        kind: 'write',
        creates: false,
        entity: 'workflow_state',
    },
    archive_workflow_state: {
        kind: 'write',
        creates: false,
        entity: 'workflow_state',
    },
    upload_image: { kind: 'write', creates: true, entity: 'comment' },
    reply: { kind: 'session', creates: true, entity: 'agent_activity' },
    whoami: { kind: 'self' },
};

/** Tool error codes; each error result leads its text with one. */
export const linearToolErrorCodeSchema = z.enum([
    'linear_input_error',
    'linear_team_outside_access',
    /** A team settings write where no actor is a member of every target team. */
    'linear_team_membership_required',
    'linear_agent_unknown',
    'linear_artifact_unavailable',
    'linear_session_not_yours',
    'linear_session_closed',
    'linear_session_actor_unavailable',
    'linear_sign_in_required',
    'linear_rate_limited',
    'linear_upstream_error',
    /** Connector → Server only: the Server force-refreshes once and resends. */
    'linear_token_rejected',
]);
export type LinearToolErrorCode = z.infer<typeof linearToolErrorCodeSchema>;

export const linearUploadMediaTypes = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
] as const;
export const linearUploadMaxBytes = 10 * 1024 * 1024;

const linearIdSchema = z.string().trim().min(1).max(100);

export const linearCallMetaSchema = z
    .object({
        accessToken: z.string().min(1).max(4096),
        actor: z
            .object({
                appUserId: linearIdSchema,
                /** Workspace actor only: the Agent's name on `issueCreate`/`commentCreate`. */
                createAsUser: z.string().trim().min(1).max(100).nullish(),
                displayIconUrl: z.url({ protocol: /^https?$/u }).nullish(),
                kind: z.enum(['workspace', 'identity']),
            })
            .strict(),
        /** Invocation timeout; the connector aborts Linear requests at it. */
        deadlineMs: z.number().int().min(1000).max(120_000),
        /** `delegate_issue` only: the target Agent's actor and `Agent` label. */
        delegation: z
            .object({
                delegateId: linearIdSchema,
                labelGroupId: linearIdSchema.nullable(),
                /** Null while the target's label is still pending. */
                labelId: linearIdSchema.nullable(),
            })
            .strict()
            .optional(),
        /** Hash namespace; op `n` creates carry `linearClientEntityId(idSeed, n)`. */
        idSeed: z.uuid(),
        requestId: z.string().min(1).max(200),
        /** `whoami` only: the invoking Agent's identity handle, null without one. */
        self: z
            .object({ identityHandle: z.string().min(1).nullable() })
            .strict()
            .optional(),
        /** `reply` only: the Linear session behind the `lss_` handle. */
        session: z.object({ linearSessionId: linearIdSchema }).strict().optional(),
        /** `upload_image` only: the checked artifact revision behind a signed source URL. */
        upload: z
            .object({
                contentType: z.enum(linearUploadMediaTypes),
                filename: z.string().min(1).max(255),
                size: z.number().int().min(1).max(linearUploadMaxBytes),
                url: z.url({ protocol: /^https?$/u }),
            })
            .strict()
            .optional(),
        workspaceId: z.string().min(1).max(100),
    })
    .strict();
export type LinearCallMeta = z.infer<typeof linearCallMetaSchema>;

/** One Linear mutation the connector completed, for the write ledger. */
export const linearMutationSchema = z
    .object({
        /** The derived client id when this op created the entity. */
        clientId: z.uuid().nullable(),
        created: z.boolean(),
        entityId: linearIdSchema,
        entityType: linearWriteTargetTypeSchema,
        /** Changed field names and the values sent, for the ledger fingerprint. */
        fields: z.record(z.string(), z.unknown()),
        opIndex: z.number().int().min(0).max(31),
        /** True when a create hit "already exists" and was read back. */
        replayed: z.boolean(),
        updatedAt: z.iso.datetime({ offset: true }).nullable(),
    })
    .strict();
export type LinearMutation = z.infer<typeof linearMutationSchema>;

/** Result `_meta`: Server strips it before the result reaches Computer. */
export const linearCallResultMetaSchema = z
    .object({
        /** False when the deadline or an error stopped the call mid-way. */
        completed: z.boolean(),
        mutations: z.array(linearMutationSchema),
    })
    .strict();
export type LinearCallResultMeta = z.infer<typeof linearCallResultMetaSchema>;

/**
 * The Linear `id` op `opIndex` of a request passes on create; `idSeed` is
 * stable per request id. Linear rejects any `id` that is not UUID version 4,
 * so this is a name-based hash shaped as v4 rather than a true UUIDv5.
 */
export function linearClientEntityId(idSeed: string, opIndex: number): string {
    return hashedUuid(String(opIndex), idSeed, 0x40);
}

/** RFC 4122 UUIDv5: SHA-1 of `namespace` + `name`. */
export function uuidV5(name: string, namespace: string): string {
    return hashedUuid(name, namespace, 0x50);
}

function hashedUuid(name: string, namespace: string, version: 0x40 | 0x50): string {
    const namespaceBytes = Buffer.from(namespace.replaceAll('-', ''), 'hex');
    if (namespaceBytes.length !== 16) {
        throw new Error('UUID namespace must be a UUID.');
    }
    const bytes = createHash('sha1').update(namespaceBytes).update(name, 'utf8').digest();
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | version;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = bytes.subarray(0, 16).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
