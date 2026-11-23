import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

/**
 * A repo on the Server's list (ADR 0060): a GitHub `owner/name`, lower-cased at
 * the boundary so the same repo never lists twice.
 */
export const repoNameSchema = z
    .string()
    .trim()
    .min(3)
    .max(200)
    .regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u, 'A repo reads as owner/name.')
    .refine((value) => !value.split('/').some((part) => part === '.' || part === '..'), {
        message: 'A repo owner or name is never . or ..',
    })
    .transform((value) => value.toLowerCase());
export type RepoName = z.infer<typeof repoNameSchema>;

/** An absolute folder path on a Computer. */
export const repoFolderPathSchema = z
    .string()
    .trim()
    .min(2)
    .max(1024)
    .refine((value) => value.startsWith('/'), { message: 'A folder path is absolute.' });

/** Who added a folder; null is Haus's own clone, made for a Worker with the machine's login. */
export const repoFolderAdderSchema = z
    .object({ name: z.string().trim().min(1).max(200), userId: idSchema })
    .strict();

/** One repo folder: where a repo lives on one Computer. One per repo per Computer. */
export const repoFolderSchema = z
    .object({
        addedAt: z.iso.datetime({ offset: true }),
        addedBy: repoFolderAdderSchema.nullable(),
        computerId: idSchema,
        path: repoFolderPathSchema,
        repository: repoNameSchema,
    })
    .strict();
export type RepoFolder = z.infer<typeof repoFolderSchema>;

/**
 * `computer.repoFolders`: the Device's folders. `canAdd` is whether the viewer is
 * the attacher, the only person who adds one. `canRemove` adds Owners and Admins.
 */
export const computerRepoFoldersInputSchema = z
    .object({ computerId: idSchema, serverId: idSchema })
    .strict();
export const computerRepoFoldersSchema = z
    .object({
        canAdd: z.boolean(),
        canRemove: z.boolean(),
        folders: z.array(repoFolderSchema).max(500),
    })
    .strict();
export type ComputerRepoFolders = z.infer<typeof computerRepoFoldersSchema>;

/**
 * `computer.addRepoFolder`: the attacher adds a checkout. The online Computer
 * reads its `origin`, which must be on `github.com`; the Server records the repo
 * it names. Publishes `computer.updated`.
 */
export const computerAddRepoFolderInputSchema = z
    .object({ computerId: idSchema, path: repoFolderPathSchema, serverId: idSchema })
    .strict();

/** Whether a folder is still there with its origin, as its online Computer answers. */
export const repoFolderStateSchema = z.enum(['present', 'missing', 'other-origin']);
export type RepoFolderState = z.infer<typeof repoFolderStateSchema>;

/**
 * `computer.removeRepoFolder`: the attacher, an Owner, or an Admin drops a
 * folder. Refuses while a Haus worktree of it exists, naming them.
 */
export const computerRemoveRepoFolderInputSchema = z
    .object({ computerId: idSchema, repository: repoNameSchema, serverId: idSchema })
    .strict();

/** `computer.repoFolderStates`: whether each folder is still there, asked of the online Computer. */
export const computerRepoFolderStatesSchema = z
    .object({
        states: z
            .array(z.object({ path: repoFolderPathSchema, state: repoFolderStateSchema }).strict())
            .max(500),
    })
    .strict();

/**
 * Server to Computer: one question about folders on this machine.
 * - `inspect` reads a folder's real path and the GitHub repo its `origin` names;
 * - `check` says whether each listed folder is still there with that origin;
 * - `worktrees` lists the Haus worktrees of a folder.
 */
export const repoFolderRequestSchema = z
    .object({
        operation: z.discriminatedUnion('kind', [
            z.object({ kind: z.literal('inspect'), path: repoFolderPathSchema }).strict(),
            z
                .object({
                    folders: z
                        .array(
                            z
                                .object({ path: repoFolderPathSchema, repository: repoNameSchema })
                                .strict()
                        )
                        .max(500),
                    kind: z.literal('check'),
                })
                .strict(),
            z.object({ kind: z.literal('worktrees'), path: repoFolderPathSchema }).strict(),
        ]),
        requestId: idSchema,
        type: z.literal('repo-folder-request'),
    })
    .strict();
export type RepoFolderRequest = z.infer<typeof repoFolderRequestSchema>;
export type RepoFolderOperation = RepoFolderRequest['operation'];

export const repoFolderAnswerSchema = z.discriminatedUnion('kind', [
    z
        .object({
            kind: z.literal('inspect'),
            path: repoFolderPathSchema,
            repository: repoNameSchema,
        })
        .strict(),
    computerRepoFolderStatesSchema.extend({ kind: z.literal('check') }).strict(),
    z
        .object({
            kind: z.literal('worktrees'),
            worktrees: z.array(repoFolderPathSchema).max(1000),
        })
        .strict(),
    z.object({ error: z.string().trim().min(1).max(500), kind: z.literal('failed') }).strict(),
]);
export type RepoFolderAnswer = z.infer<typeof repoFolderAnswerSchema>;

export const repoFolderResultSchema = z
    .object({
        answer: repoFolderAnswerSchema,
        requestId: idSchema,
        type: z.literal('repo-folder-result'),
    })
    .strict();
export type RepoFolderResult = z.infer<typeof repoFolderResultSchema>;

/**
 * Computer to Server, on every connect and after each new clone: Haus's own
 * clones in this Server's partition. Each becomes the Computer's folder for its
 * repo when it has none, which puts the repo on the Server's list.
 */
export const repoClonesFrameSchema = z
    .object({
        clones: z
            .array(z.object({ path: repoFolderPathSchema, repository: repoNameSchema }).strict())
            .max(500),
        type: z.literal('repo-clones'),
    })
    .strict();
export type RepoClonesFrame = z.infer<typeof repoClonesFrameSchema>;

/** `POST /computer/repos/{add,remove,list}`: `haus-computer repo` acting as the signed-in person. */
export const computerCliRepoAddInputSchema = z
    .object({
        accessToken: z.string().min(1).max(500),
        computerId: idSchema,
        path: repoFolderPathSchema,
        repository: repoNameSchema,
    })
    .strict();
export const computerCliRepoRemoveInputSchema = z
    .object({
        accessToken: z.string().min(1).max(500),
        computerId: idSchema,
        repository: repoNameSchema,
    })
    .strict();
export const computerCliRepoListInputSchema = z
    .object({ accessToken: z.string().min(1).max(500), computerId: idSchema })
    .strict();

/** `haus repo list`: every repo on the Server's list with the Computers that have a folder for it. */
export const agentRepoListSchema = z
    .object({
        repos: z
            .array(
                z
                    .object({
                        computers: z
                            .array(
                                z
                                    .object({
                                        computerId: idSchema,
                                        name: z.string().trim().min(1).max(100).nullable(),
                                    })
                                    .strict()
                            )
                            .max(100),
                        repository: repoNameSchema,
                    })
                    .strict()
            )
            .max(1000),
    })
    .strict();
export type AgentRepoList = z.infer<typeof agentRepoListSchema>;

/** An Agent's worktree goes 7 days after it was last used, once it is clean. */
export const agentWorktreeIdleMs = 7 * 24 * 60 * 60 * 1000;

/** Every Agent branch starts here: `haus/<agent-id>/<name>`. */
export function agentRepoBranch(agentId: string, repository: string) {
    const name = repository.split('/')[1] ?? repository;
    return `haus/${agentId}/${name}`;
}
