import * as z from 'zod';

// The built-in GitHub connection's installation contracts
// (specs/github-app-connection.md#installations). `installationId` always names
// a Haus installation row (`ghi_…`); GitHub's own numeric installation id is
// `githubInstallationId`. Account and repository ids are GitHub's numbers.

const idSchema = z.string().trim().min(1);
const timestampSchema = z.iso.datetime({ offset: true });
const githubIdSchema = z.number().int().positive();

/** Haus installation row ids: `ghi_` and 16 base64url characters. */
export const githubInstallationRowIdPrefix = 'ghi';

export const githubAccountTypeSchema = z.enum(['User', 'Organization']);
export type GithubAccountType = z.infer<typeof githubAccountTypeSchema>;

export const githubRepositorySelectionSchema = z.enum(['all', 'selected']);
export type GithubRepositorySelection = z.infer<typeof githubRepositorySelectionSchema>;

/** `removed` rows are tombstones that keep dependent Triggers explainable. */
export const githubInstallationStatusSchema = z.enum(['active', 'suspended', 'removed']);
export type GithubInstallationStatus = z.infer<typeof githubInstallationStatusSchema>;

/** GitHub's permission map for an installation, such as `{ actions: 'write' }`. */
export const githubInstallationPermissionsSchema = z.record(
    z.string().min(1),
    z.enum(['read', 'write', 'admin'])
);
export type GithubInstallationPermissions = z.infer<typeof githubInstallationPermissionsSchema>;

export const githubAccountSchema = z
    .object({
        id: githubIdSchema,
        login: z.string().min(1),
        type: githubAccountTypeSchema,
    })
    .strict();
export type GithubAccount = z.infer<typeof githubAccountSchema>;

/** One App installation bound to a Haus Server through one GitHub connection. */
export const githubInstallationSchema = z
    .object({
        /** Repositories the connection's GitHub user can reach, from the access cache. */
        accessibleRepositoryCount: z.number().int().nonnegative(),
        accessSyncedAt: timestampSchema.nullable(),
        account: githubAccountSchema,
        /** Null once removed: a tombstone belongs to no connection. */
        connectionId: idSchema.nullable(),
        createdAt: timestampSchema,
        githubInstallationId: githubIdSchema,
        id: idSchema,
        permissions: githubInstallationPermissionsSchema,
        removedAt: timestampSchema.nullable(),
        repositorySelection: githubRepositorySelectionSchema,
        status: githubInstallationStatusSchema,
        updatedAt: timestampSchema,
    })
    .strict();
export type GithubInstallation = z.infer<typeof githubInstallationSchema>;

/** An unbound installation the signed-in GitHub user owns, offered for binding. */
export const githubInstallCandidateSchema = z
    .object({
        account: githubAccountSchema,
        githubInstallationId: githubIdSchema,
        repositorySelection: githubRepositorySelectionSchema,
    })
    .strict();
export type GithubInstallCandidate = z.infer<typeof githubInstallCandidateSchema>;

/** One repository the connection's GitHub user can access in an installation. */
export const githubRepositorySchema = z
    .object({
        fullName: z.string().min(1),
        id: githubIdSchema,
        private: z.boolean(),
    })
    .strict();
export type GithubRepository = z.infer<typeof githubRepositorySchema>;

const connectionInputSchema = z.object({ connectionId: idSchema, serverId: idSchema }).strict();

export const githubInstallationsInputSchema = connectionInputSchema;
export const githubInstallationsSchema = z.array(githubInstallationSchema);

/** Starts an install on GitHub; the answer is the URL to send the browser to. */
export const githubStartInstallInputSchema = connectionInputSchema;
export const githubStartInstallResultSchema = z.object({ url: z.url() }).strict();

export const githubInstallCandidatesInputSchema = connectionInputSchema;
export const githubInstallCandidatesSchema = z.array(githubInstallCandidateSchema);

export const githubBindInstallationInputSchema = z
    .object({ connectionId: idSchema, githubInstallationId: githubIdSchema, serverId: idSchema })
    .strict();
export const githubInstallationResultSchema = z
    .object({ installation: githubInstallationSchema })
    .strict();

export const githubUnbindInstallationInputSchema = z
    .object({ installationId: idSchema, serverId: idSchema })
    .strict();

export const githubRepositoriesInputSchema = z
    .object({
        installationId: idSchema,
        query: z.string().trim().min(1).max(200).optional(),
        serverId: idSchema,
    })
    .strict();
export const githubRepositoriesSchema = z.array(githubRepositorySchema);

/**
 * One installation an Agent can use (`haus github installations`): a live
 * installation on a GitHub connection the Agent holds the grant on.
 * `repositories` is present only when the Agent asked for them.
 */
export const agentGithubInstallationSchema = z
    .object({
        accessibleRepositoryCount: z.number().int().nonnegative(),
        account: githubAccountSchema,
        githubInstallationId: githubIdSchema,
        id: idSchema,
        repositories: z.array(githubRepositorySchema).optional(),
        repositorySelection: githubRepositorySelectionSchema,
        status: githubInstallationStatusSchema,
    })
    .strict();
export type AgentGithubInstallation = z.infer<typeof agentGithubInstallationSchema>;

export const agentGithubInstallationsSchema = z
    .object({ installations: z.array(agentGithubInstallationSchema) })
    .strict();
export type AgentGithubInstallations = z.infer<typeof agentGithubInstallationsSchema>;
