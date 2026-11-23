import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { githubAccountSchema } from './github.ts';
import { repoFolderPathSchema, repoFolderStateSchema, repoNameSchema } from './repos.ts';

/**
 * Whether the Server's Haus GitHub App can reach a repo, so a Captain can push
 * to it and open pull requests (specs/github-app-connection.md#git-on-a-computer):
 * - `ready`: a live installation on the owner reaches the repo;
 * - `app-needs-access`: the owner has no live installation (`installation`
 *   null), or the installation is suspended or does not select the repo;
 * - `github-not-connected`: the Server has no GitHub connection or no App;
 * - `github-unavailable`: GitHub did not answer the check.
 */
export const repoGithubAccessSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal('ready') }).strict(),
    z
        .object({
            installation: z
                .object({
                    account: githubAccountSchema,
                    githubInstallationId: z.number().int().positive(),
                })
                .strict()
                .nullable(),
            status: z.literal('app-needs-access'),
        })
        .strict(),
    z.object({ status: z.literal('github-not-connected') }).strict(),
    z.object({ status: z.literal('github-unavailable') }).strict(),
]);
export type RepoGithubAccess = z.infer<typeof repoGithubAccessSchema>;
export type RepoGithubAccessStatus = RepoGithubAccess['status'];

/** `computer.addRepoFolder`'s answer: the repo the folder names and the App's access to it. */
export const computerAddRepoFolderResultSchema = z
    .object({
        added: z.boolean(),
        githubAccess: repoGithubAccessSchema,
        path: repoFolderPathSchema,
        repository: repoNameSchema,
    })
    .strict();
export type ComputerAddRepoFolderResult = z.infer<typeof computerAddRepoFolderResultSchema>;

/**
 * `repo.list`: every repo on the Server's list (ADR 0060), the Devices that
 * hold a folder for it, and the App's access to it. A folder's `state` is what
 * its online Device answered, or null when the Device is offline or did not
 * answer. `githubConnectionId` is the Server's GitHub connection, and
 * `canInstallGithubApp` is whether the viewer may start an install through it.
 */
export const repoListInputSchema = z.object({ serverId: idSchema }).strict();
export const repoListFolderSchema = z
    .object({
        computerId: idSchema,
        computerName: z.string().trim().min(1).max(100).nullable(),
        path: repoFolderPathSchema,
        state: repoFolderStateSchema.nullable(),
    })
    .strict();
export type RepoListFolder = z.infer<typeof repoListFolderSchema>;
export const repoListEntrySchema = z
    .object({
        folders: z.array(repoListFolderSchema).max(100),
        githubAccess: repoGithubAccessSchema,
        repository: repoNameSchema,
    })
    .strict();
export type RepoListEntry = z.infer<typeof repoListEntrySchema>;
export const repoListSchema = z
    .object({
        canInstallGithubApp: z.boolean(),
        githubConnectionId: idSchema.nullable(),
        repos: z.array(repoListEntrySchema).max(1000),
    })
    .strict();
export type RepoList = z.infer<typeof repoListSchema>;
