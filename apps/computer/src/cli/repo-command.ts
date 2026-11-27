import { resolve } from 'node:path';
import { repoFolderSchema, repoNameSchema } from '@haus/api';
import * as z from 'zod';
import type { AttachmentRecord as Attachment } from '../attachment.ts';
import { resolveComputerLogin } from '../login.ts';
import { worktreesRoot } from '../repos/layout.ts';
import { inspectRepoFolder } from '../repos/repo-folder-requests.ts';
import { listWorktrees } from '../repos/worktree.ts';
import type { CliRenderer } from './render.ts';
import { postComputerRoute } from './server-request.ts';

export interface RepoCommandInput {
    dataRoot: string;
    listAttachments(): Promise<Attachment[]>;
    print(line: string): void;
    render: CliRenderer;
}

export const repoFolderDisclosure =
    'Workers and Captains work in git worktrees of this folder and share its `.git`. A Worker can change its branches, including `main`, and its hooks and config.';

const usage =
    'Run haus-computer repo add <path> [/server-slug], repo list [/server-slug], or repo remove <owner/name> [/server-slug].';

type RepoCall =
    | { kind: 'add'; path: string; slug: string | undefined }
    | { kind: 'list'; slug: string | undefined }
    | { kind: 'remove'; repository: string; slug: string | undefined };

export async function runRepoCommand(args: readonly string[], input: RepoCommandInput) {
    const call = readRepoCall(args);
    const attachment = pickAttachment(await input.listAttachments(), call.slug);
    const session = await resolveComputerLogin({
        allowLogin: false,
        dataRoot: input.dataRoot,
        serverOrigin: attachment.serverOrigin,
    });
    const scope = { accessToken: session.accessToken, computerId: attachment.computerId };
    const post = (path: string, body: object) =>
        postComputerRoute<unknown>(path, { ...scope, ...body }, attachment.serverOrigin);
    const { render } = input;
    switch (call.kind) {
        case 'add': {
            const folder = await inspectRepoFolder(resolve(call.path));
            const added = addedSchema.parse(await post('/computer/repos/add', folder));
            const verb = added.added ? 'Added' : 'Already had';
            input.print(render.ok(`${verb} ${added.path} as the folder for ${added.repository}.`));
            input.print(render.hint(repoFolderDisclosure));
            return;
        }
        case 'remove': {
            const body = { repository: call.repository };
            const removed = removedSchema.parse(await post('/computer/repos/remove', body));
            input.print(
                removed.removed
                    ? render.ok(`Removed this Computer's folder for ${call.repository}.`)
                    : render.warn(`This Computer has no folder for ${call.repository}.`)
            );
            return;
        }
        case 'list': {
            const listed = listedSchema.parse(await post('/computer/repos/list', {}));
            const root = worktreesRoot(input.dataRoot, attachment.serverId);
            printList(
                input,
                listed,
                (await listWorktrees(root)).map((found) => found.path)
            );
            return;
        }
        default: {
            const exhaustive: never = call;
            return exhaustive;
        }
    }
}

export function readRepoCall(args: readonly string[]) {
    const [action, first, second, ...extra] = args;
    if (extra.length > 0) {
        throw new Error(usage);
    }
    if (action === 'list' && second === undefined) {
        return { kind: 'list', slug: slugOf(first) } satisfies RepoCall;
    }
    if (action === 'add' && first !== undefined) {
        return { kind: 'add', path: first, slug: slugOf(second) } satisfies RepoCall;
    }
    if (action === 'remove' && first !== undefined) {
        const repository = repoNameSchema.safeParse(first);
        if (!repository.success) {
            throw new Error(`"${first}" is not a repo. A repo reads as owner/name.`);
        }
        return {
            kind: 'remove',
            repository: repository.data,
            slug: slugOf(second),
        } satisfies RepoCall;
    }
    throw new Error(usage);
}

function printList(
    input: RepoCommandInput,
    listed: z.infer<typeof listedSchema>,
    worktrees: readonly string[]
) {
    const { render } = input;
    if (listed.folders.length === 0) {
        input.print(
            `${listed.computerName} has no repo folders yet. Add one with haus-computer repo add <path>.`
        );
    } else {
        input.print(render.heading(`Repo folders on ${listed.computerName}`));
        const width = Math.max(...listed.folders.map((folder) => folder.repository.length));
        for (const folder of listed.folders) {
            const by = folder.addedBy ? `added by ${folder.addedBy.name}` : "Haus's own clone";
            input.print(
                `  ${folder.repository.padEnd(width + 2)}${folder.path}  ${render.hint(by)}`
            );
        }
    }
    if (worktrees.length > 0) {
        input.print('');
        input.print(render.heading('Haus worktrees here'));
        for (const path of worktrees) {
            input.print(`  ${path}`);
        }
    }
}

function pickAttachment(attachments: readonly Attachment[], slug: string | undefined) {
    if (slug !== undefined) {
        const found = attachments.find((attachment) => attachment.slug === slug);
        if (!found) {
            throw new Error(`This Haus Computer is not attached to /${slug}.`);
        }
        return found;
    }
    const [only, ...others] = attachments;
    if (!only) {
        throw new Error(
            'This Haus Computer is not attached to a Server. Run haus-computer setup /server-slug first.'
        );
    }
    if (others.length > 0) {
        throw new Error(`This Computer is attached to more than one Server. ${usage}`);
    }
    return only;
}

function slugOf(arg: string | undefined) {
    if (arg === undefined) {
        return undefined;
    }
    if (!/^\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(arg)) {
        throw new Error(`Choose a Server as /server-slug, not "${arg}". ${usage}`);
    }
    return arg.slice(1);
}

const addedSchema = z.object({ added: z.boolean(), path: z.string(), repository: z.string() });
const removedSchema = z.object({ removed: z.boolean(), repository: z.string() });
const listedSchema = z.object({ computerName: z.string(), folders: z.array(repoFolderSchema) });
