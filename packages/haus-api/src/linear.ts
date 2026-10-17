import * as z from 'zod';

// The built-in Linear connection's contracts (specs/linear-app.md): the Haus
// app's workspace binding, optional per-Agent Linear identities, Linear
// sessions, the write ledger's vocabulary, the Linear page procedures, issue
// chips, and the Agent route. Haus row ids are a prefix and 16 base64url
// characters; Linear's own ids are opaque strings.

const idSchema = z.string().trim().min(1);
const timestampSchema = z.iso.datetime({ offset: true });
/** A Linear object id (team, issue, label, user, organization, ...). */
export const linearObjectIdSchema = z.string().trim().min(1).max(100);

/** Haus row id prefixes, one per Linear table that owns its id. */
export const linearRowIdPrefixes = {
    agentLabel: 'lnb',
    credential: 'lna',
    delivery: 'lnd',
    identity: 'lni',
    oauthAttempt: 'lno',
    session: 'lss',
    workspace: 'lnw',
    write: 'lnl',
} as const;

/** `removed` is a tombstone: no connection, binding released, Triggers explainable. */
export const linearWorkspaceStatusSchema = z.enum([
    'active',
    'refresh_required',
    'revoked',
    'disconnected',
    'removed',
]);
export type LinearWorkspaceStatus = z.infer<typeof linearWorkspaceStatusSchema>;

export const linearIdentityStatusSchema = z.enum([
    'draft',
    'active',
    'inactive',
    'refresh_required',
    'revoked',
    'removed',
]);
export type LinearIdentityStatus = z.infer<typeof linearIdentityStatusSchema>;

export const linearCredentialStateSchema = z.enum(['valid', 'refresh_required', 'revoked']);
export type LinearCredentialState = z.infer<typeof linearCredentialStateSchema>;

export const linearOauthPurposeSchema = z.enum([
    'workspace_install',
    'workspace_reconnect',
    'identity_install',
]);
export type LinearOauthPurpose = z.infer<typeof linearOauthPurposeSchema>;

export const linearDeliveryStateSchema = z.enum([
    'queued',
    'processing',
    'done',
    'ignored',
    'failed',
]);
export type LinearDeliveryState = z.infer<typeof linearDeliveryStateSchema>;

export const linearDeliveryIgnoredReasonSchema = z.enum([
    'unknown_workspace',
    'workspace_inactive',
    'unsupported_event',
    'team_outside_access',
]);
export type LinearDeliveryIgnoredReason = z.infer<typeof linearDeliveryIgnoredReasonSchema>;

export const linearSessionStatusSchema = z.enum([
    'active',
    'complete',
    'stopped',
    'handed_off',
    'orphaned',
]);
export type LinearSessionStatus = z.infer<typeof linearSessionStatusSchema>;

export const linearAgentLabelStateSchema = z.enum(['pending', 'active', 'archived']);
export type LinearAgentLabelState = z.infer<typeof linearAgentLabelStateSchema>;

export const linearWriteStatusSchema = z.enum(['pending', 'succeeded', 'failed', 'unknown']);
export type LinearWriteStatus = z.infer<typeof linearWriteStatusSchema>;

export const linearWriteTargetTypeSchema = z.enum([
    'issue',
    'comment',
    'project',
    'document',
    'label',
    'workflow_state',
    'agent_activity',
]);
export type LinearWriteTargetType = z.infer<typeof linearWriteTargetTypeSchema>;

/** Agent activity types a Linear session `reply` may post. */
export const linearActivityTypeSchema = z.enum([
    'thought',
    'action',
    'response',
    'elicitation',
    'error',
]);
export type LinearActivityType = z.infer<typeof linearActivityTypeSchema>;

/**
 * Why the Server refused a Linear request. tRPC answers lead the message with
 * the code; connector tool errors carry it as their stable code.
 */
export const linearRefusalSchema = z.enum([
    'linear_admin_required',
    'linear_app_unconfigured',
    'linear_identity_already_bound',
    'linear_session_actor_unavailable',
    'linear_session_closed',
    'linear_session_not_yours',
    'linear_sign_in_required',
    'linear_team_membership_required',
    'linear_team_outside_access',
    'linear_workspace_already_bound',
]);
export type LinearRefusal = z.infer<typeof linearRefusalSchema>;

export const linearTeamSchema = z
    .object({ id: linearObjectIdSchema, key: z.string().min(1), name: z.string().min(1) })
    .strict();
export type LinearTeam = z.infer<typeof linearTeamSchema>;

/** One Linear organization bound to a Haus Server through one Linear connection. */
export const linearWorkspaceSchema = z
    .object({
        /** Null once removed: a tombstone belongs to no connection. */
        connectionId: idSchema.nullable(),
        defaultAgentId: idSchema.nullable(),
        id: idSchema,
        lastDeliveryAt: timestampSchema.nullable(),
        /** Teams the Haus app user is a member of; team settings writes need membership. */
        memberTeamIds: z.array(linearObjectIdSchema),
        name: z.string().min(1),
        organizationId: linearObjectIdSchema,
        removedAt: timestampSchema.nullable(),
        status: linearWorkspaceStatusSchema,
        /** The workspace actor's team access; empty for writes once older than 24 hours. */
        teams: z.array(linearTeamSchema),
        teamsSyncedAt: timestampSchema.nullable(),
        urlKey: z.string().min(1),
    })
    .strict();
export type LinearWorkspace = z.infer<typeof linearWorkspaceSchema>;

/** Webhook events an identity app ticks in Linear's settings. */
export const linearIdentityWebhookEventSchema = z.enum([
    'agent_session_events',
    'permission_changes',
    'oauth_app_revoked',
]);
export type LinearIdentityWebhookEvent = z.infer<typeof linearIdentityWebhookEventSchema>;

/** The guided flow's pre-filled values, each shown with a copy button. */
export const linearIdentityDraftSchema = z
    .object({
        appName: z.string().min(1),
        /**
         * Linear's list of the workspace's own applications, where an app
         * already made shows its client id and webhook signing secret.
         */
        appsUrl: z.url(),
        avatarUrl: z.url().nullable(),
        callbackUrl: z.url(),
        /**
         * Linear's new-application page, pre-filled through Linear's OAuth app
         * manifest (https://linear.app/developers/oauth-app-manifests).
         */
        createAppUrl: z.url(),
        /**
         * Whether that page arrives with the webhook URL and events filled in.
         * False when the public origin is not HTTPS on a public host, so Linear
         * could not deliver to it; the Owner fills the webhook in by hand.
         */
        createAppPrefillsWebhook: z.boolean(),
        identityId: idSchema,
        webhookEvents: z.array(linearIdentityWebhookEventSchema).min(1),
        webhookUrl: z.url(),
    })
    .strict();
export type LinearIdentityDraft = z.infer<typeof linearIdentityDraftSchema>;

/** One Agent's Linear identity: a private Linear app the Owner registered for it. */
export const linearIdentitySchema = z
    .object({
        agentId: idSchema,
        /** Whether the client id and webhook signing secret are saved, so install can start. */
        credentialsSaved: z.boolean(),
        /** The guided flow's values, readable again for any identity not yet removed. */
        guidedFlow: linearIdentityDraftSchema,
        /** The app user's Linear mention handle, known once installed. */
        handle: z.string().min(1).nullable(),
        id: idSchema,
        lastDeliveryAt: timestampSchema.nullable(),
        /** Teams the identity's app user is a member of; empty until installed and synced. */
        memberTeamIds: z.array(linearObjectIdSchema),
        status: linearIdentityStatusSchema,
        workspaceId: idSchema,
    })
    .strict();
export type LinearIdentity = z.infer<typeof linearIdentitySchema>;

const serverInputSchema = z.object({ serverId: idSchema }).strict();
const connectionInputSchema = z.object({ connectionId: idSchema, serverId: idSchema }).strict();
const identityInputSchema = z.object({ identityId: idSchema, serverId: idSchema }).strict();

export const linearWorkspacesInputSchema = serverInputSchema;
export const linearWorkspacesSchema = z.array(linearWorkspaceSchema);

/** A connection id reconnects that connection; omitted, it connects a new workspace. */
export const linearStartInstallInputSchema = z
    .object({ connectionId: idSchema.optional(), serverId: idSchema })
    .strict();
export const linearAuthorizeResultSchema = z.object({ authorizeUrl: z.url() }).strict();

export const linearSetDefaultAgentInputSchema = z
    .object({ agentId: idSchema.nullable(), connectionId: idSchema, serverId: idSchema })
    .strict();

/** Refresh teams: re-reads the workspace's team access from Linear now. */
export const linearSyncTeamsInputSchema = connectionInputSchema;

export const linearIdentitiesInputSchema = connectionInputSchema;
export const linearIdentitiesSchema = z.array(linearIdentitySchema);

export const linearCreateIdentityDraftInputSchema = z
    .object({ agentId: idSchema, connectionId: idSchema, serverId: idSchema })
    .strict();

/** Identity installs use PKCE, so there is no client secret to paste. */
export const linearSaveIdentityCredentialsInputSchema = z
    .object({
        /** Only while `draft`; omitted, the saved client id stays (a secret rotation). */
        clientId: z.string().trim().min(1).max(200).optional(),
        identityId: idSchema,
        serverId: idSchema,
        webhookSigningSecret: z.string().trim().min(1).max(200),
    })
    .strict();

export const linearStartIdentityInstallInputSchema = identityInputSchema;
export const linearRemoveIdentityInputSchema = identityInputSchema;

/** Reference pickers for Linear Trigger filters (specs/linear-triggers.md#app-ui). */
export const linearReferenceKindSchema = z.enum([
    'teams',
    'projects',
    'labels',
    'states',
    'users',
    'project_statuses',
]);
export type LinearReferenceKind = z.infer<typeof linearReferenceKindSchema>;

export const linearReferencesInputSchema = z
    .object({
        connectionId: idSchema,
        kind: linearReferenceKindSchema,
        query: z.string().trim().min(1).max(200).optional(),
        serverId: idSchema,
    })
    .strict();

export const linearReferenceSchema = z
    .object({
        id: linearObjectIdSchema,
        name: z.string().min(1),
        /** The owning team for team-scoped references (states, team labels). */
        teamId: linearObjectIdSchema.nullable(),
    })
    .strict();
export type LinearReference = z.infer<typeof linearReferenceSchema>;

export const linearReferencesSchema = z.array(linearReferenceSchema);
