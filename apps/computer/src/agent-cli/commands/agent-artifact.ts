import fs from 'node:fs/promises';
import path from 'node:path';
import {
    artifactListResultSchema,
    artifactMetadataSchema,
    artifactMoveResultSchema,
    artifactVersionsResultSchema,
} from '@haus/api';
import * as z from 'zod';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { type ParsedArgs, UsageError } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import { requireDrivePath, runArtifactPull } from './artifact-pull.ts';
import { runArtifactPush } from './artifact-push.ts';
import { ARTIFACT_SHARE_SUBCOMMAND } from './artifact-share.ts';
import { artifactRoute, resolveArtifactId } from './artifact-target.ts';
import { uploadArtifact } from './artifact-upload.ts';

const revisionFlag = { name: '--revision-id', valueName: '<id>', description: 'A fixed revision' };
const targetPositional = '<id|link|path>';

export const ARTIFACT_SUBCOMMANDS: SubCommand[] = [
    {
        name: 'list',
        summary: 'Browse Files: a folder’s subfolders and files',
        usage: 'haus files list [<folder>] [--recursive] [--query <text>] [--mine] [--offset <n>]',
        positionals: ['[<folder>]'],
        allowExtraPositionals: true,
        examples: [
            'haus files list',
            'haus files list starter-kit',
            'haus files list --recursive --query roadmap',
        ],
        flags: [
            { name: '--recursive', description: 'Every file at any depth under the folder' },
            { name: '--query', valueName: '<text>', description: 'Match titles and paths' },
            { name: '--mine', description: 'Only files you created' },
            { name: '--offset', valueName: '<n>', description: 'File page offset (next_offset)' },
        ],
        notes: [
            '50 files per page. Without a folder, lists the top of Files.',
            'Output opens with summary, the folder’s totals (also under --recursive); folders and files each come newest first.',
        ],
        run: (args) => runArtifactList(args),
    },
    {
        name: 'pull',
        summary: 'Copy a shared file or folder into your workspace to work on',
        usage: 'haus files pull <path> [<local-path>]',
        positionals: ['<path>', '[<local-path>]'],
        allowExtraPositionals: true,
        examples: [
            'haus files pull starter-kit',
            'haus files pull starter-kit/scripts/check.py ./starter-kit/scripts/check.py',
        ],
        flags: [],
        notes: [
            'A folder lands in ./<folder-name> (or <local-path>) with its subfolders; a file lands in the working directory (or <local-path>).',
            'Records what you pulled in .haus-artifacts.json so push can check your changes against it. Do not edit that file.',
            'Pulling again updates unchanged files. A file you edited keeps your edits; the version in Files lands beside it as <file>.haus-theirs to merge.',
        ],
        run: (args) => runArtifactPull(arity(args, 1, 2), createAgentApiClient()),
    },
    {
        name: 'push',
        summary: 'Share local files: create new ones and publish your changes as revisions',
        usage: 'haus files push <local-path> [<path>] [--replace] [--title <title>] [--dry-run]',
        positionals: ['<local-path>', '[<path>]'],
        allowExtraPositionals: true,
        examples: [
            'haus files push ./starter-kit',
            'haus files push ./report.pdf reports/q4.pdf --title "Q4 report"',
            'haus files push ./starter-kit --dry-run',
        ],
        flags: [
            { name: '--replace', description: 'Overwrite the version in Files whatever it is now' },
            { name: '--title', valueName: '<title>', description: 'Title for a single-file push' },
            { name: '--dry-run', description: 'Show what would be created or updated' },
        ],
        notes: [
            'Unchanged files are skipped. A pulled file publishes a revision only if nobody changed it since your pull; otherwise it is listed under conflicts with the pull command that fetches the current version.',
            'A new file goes to <path> in Files, or keeps the folder it was pulled from, or lands under the pushed folder name.',
            'Skips symlinks, .git, node_modules, __pycache__, .DS_Store, .haus-theirs files, and .haus-artifacts.json. Rerunning a push is safe.',
            'Share the printed stable_url in your message; do not also attach the file.',
        ],
        run: (args) => runArtifactPush(arity(args, 1, 2), uploadArtifact),
    },
    {
        name: 'mv',
        summary: 'Move or rename a shared file or folder',
        usage: 'haus files mv <from> <to> [--base-revision-id <id>]',
        positionals: ['<from>', '<to>'],
        examples: [
            'haus files mv drafts/plan.md plans/plan.md',
            'haus files mv drafts archive/drafts',
        ],
        flags: [
            {
                name: '--base-revision-id',
                valueName: '<id>',
                description: 'Move a file only if this is still its current revision',
            },
        ],
        notes: ['Links and ids stay the same. Pull the folder again to refresh local copies.'],
        run: async (args) => {
            const [from, to] = args.positionals;
            return print(
                await createAgentApiClient().request(
                    '/api/agent/artifacts/move',
                    artifactMoveResultSchema,
                    {
                        method: 'POST',
                        body: {
                            from: requireDrivePath(from),
                            to: requireDrivePath(to),
                            base_revision_id: args.values['--base-revision-id'],
                        },
                    }
                )
            );
        },
    },
    {
        name: 'view',
        summary: 'Read a shared file through a read-only cached path',
        usage: `haus files view ${targetPositional} [--revision-id <id>] [--output <path>]`,
        positionals: [targetPositional],
        examples: [
            'haus files view https://haus.chat/s/demo/artifacts/art_123',
            'haus files view reports/q4.pdf --output ./q4.pdf',
        ],
        flags: [
            revisionFlag,
            {
                name: '--output',
                valueName: '<path>',
                description: 'Also write a personal copy here',
            },
        ],
        run: async (args) => {
            const client = createAgentApiClient();
            const id = await resolveArtifactId(client, args.positionals[0]);
            const result = await client.request(
                artifactRoute(id, '/view'),
                z.object({ artifact: artifactMetadataSchema, path: z.string().min(1) }),
                { query: { revision_id: args.values['--revision-id'] }, timeoutMs: 300_000 }
            );
            const output = args.values['--output'];
            if (output) {
                await fs.copyFile(result.path, output, fs.constants.COPYFILE_EXCL);
                await fs.chmod(output, 0o600);
            }
            return print({ ...result, path: output ? path.resolve(output) : result.path });
        },
    },
    {
        name: 'versions',
        summary: 'List a shared file’s retained revisions',
        usage: `haus files versions ${targetPositional} [--offset <n>]`,
        positionals: [targetPositional],
        examples: ['haus files versions reports/q4.pdf'],
        flags: [{ name: '--offset', valueName: '<n>', description: 'Pagination offset' }],
        run: async (args) => {
            const client = createAgentApiClient();
            const id = await resolveArtifactId(client, args.positionals[0]);
            return print(
                await client.request(artifactRoute(id, '/versions'), artifactVersionsResultSchema, {
                    query: { offset: args.values['--offset'] ?? '0' },
                })
            );
        },
    },
    ARTIFACT_SHARE_SUBCOMMAND,
    {
        name: 'delete',
        summary: 'Delete a shared file or one historical revision',
        usage: `haus files delete ${targetPositional} [--revision-id <id>]`,
        positionals: [targetPositional],
        examples: [
            'haus files delete drafts/old.md',
            'haus files delete art_123 --revision-id rev_456',
        ],
        flags: [revisionFlag],
        run: async (args) => {
            const client = createAgentApiClient();
            const id = await resolveArtifactId(client, args.positionals[0]);
            const revision = args.values['--revision-id'];
            return print(
                await client.request(
                    artifactRoute(
                        id,
                        revision ? `/versions/${encodeURIComponent(revision)}/delete` : '/delete'
                    ),
                    z.object({ ok: z.literal(true) }),
                    { method: 'POST' }
                )
            );
        },
    },
];

export async function runArtifactList(
    args: ParsedArgs,
    client: AgentApiRequester = createAgentApiClient()
): Promise<number> {
    const [folder] = arity(args, 0, 1).positionals;
    const prefix =
        folder === undefined || folder === '' || folder === '/' ? '' : requireDrivePath(folder);
    const result = await client.request('/api/agent/artifacts', artifactListResultSchema, {
        query: {
            prefix,
            recursive: args.flags['--recursive'] ? 'true' : undefined,
            offset: args.values['--offset'] ?? '0',
            query: args.values['--query'],
            mine: args.flags['--mine'] ? 'true' : undefined,
        },
    });
    return print({
        summary: result.summary,
        folder: prefix,
        folders: result.folders,
        files: result.artifacts.map((artifact) => ({
            path: artifact.path,
            title: artifact.title,
            artifact_id: artifact.artifact_id,
            revision_id: artifact.revision_id,
            revision_number: artifact.revision_number,
            size_bytes: artifact.size_bytes,
            updated_at: artifact.updated_at,
            creator: artifact.creator,
            stable_url: artifact.stable_url,
        })),
        next_offset: result.next_offset,
    });
}

function arity(args: ParsedArgs, min: number, max: number): ParsedArgs {
    const count = args.positionals.length;
    if (count < min || count > max) {
        throw new UsageError(`Expected ${min}-${max} arguments, got ${count}.`);
    }
    return args;
}

function print(value: unknown): number {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return 0;
}
