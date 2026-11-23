import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { repoNameSchema } from './repos.ts';

export const computerGitCredentialPath = '/computer/github/git-credential';
export const computerGitIdentityPath = '/computer/github/bot';

/** The username git sends with an installation token over HTTPS. */
export const githubTokenUsername = 'x-access-token';

/**
 * `write` serves git inside one open Agent invocation, which names the Agent.
 * `read` serves the Computer's own cleanup fetches of an Agent's worktree.
 */
export const computerGitCredentialRequestSchema = z.discriminatedUnion('access', [
    z
        .object({
            access: z.literal('write'),
            invocationId: idSchema,
            repository: repoNameSchema,
        })
        .strict(),
    z
        .object({
            access: z.literal('read'),
            agentId: idSchema,
            repository: repoNameSchema,
        })
        .strict(),
]);
export type ComputerGitCredentialRequest = z.infer<typeof computerGitCredentialRequestSchema>;

export const computerGitCredentialSchema = z
    .object({ expiresAt: z.iso.datetime({ offset: true }), token: z.string().min(1) })
    .strict();
export type ComputerGitCredential = z.infer<typeof computerGitCredentialSchema>;

export const computerGitRefusalCodeSchema = z.enum([
    'github_app_unavailable',
    'github_app_needs_access',
    'github_connection_not_granted',
    'repo_folder_missing',
    'agent_not_allowed',
    'invocation_not_open',
]);
export type ComputerGitRefusalCode = z.infer<typeof computerGitRefusalCodeSchema>;

export const computerGitRefusalSchema = z
    .object({ code: computerGitRefusalCodeSchema, error: z.string().min(1) })
    .strict();

/** The bot's git author and committer: `<slug>[bot]` and its GitHub noreply address. */
export const gitIdentitySchema = z
    .object({ email: z.string().min(3).max(320), name: z.string().min(1).max(200) })
    .strict();
export type GitIdentity = z.infer<typeof gitIdentitySchema>;

export function githubBotIdentity(slug: string, userId: number) {
    const name = `${slug}[bot]`;
    const identity: GitIdentity = { email: `${userId}+${name}@users.noreply.github.com`, name };
    return identity;
}

/** `haus repo co-author`: the people whose messages a turn answers, as commit trailers. */
export const agentCoAuthorInputSchema = z
    .object({ people: z.array(z.string().trim().min(1).max(64)).min(1).max(20) })
    .strict();
export const agentCoAuthorSchema = z
    .object({
        coAuthors: z
            .array(z.object({ handle: z.string(), trailer: z.string().min(1) }).strict())
            .max(20),
        missing: z
            .array(
                z.object({ handle: z.string(), reason: z.enum(['unknown', 'no-email']) }).strict()
            )
            .max(20),
    })
    .strict();
export type AgentCoAuthors = z.infer<typeof agentCoAuthorSchema>;
