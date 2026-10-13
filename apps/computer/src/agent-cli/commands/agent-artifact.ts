import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
    artifactListResultSchema,
    artifactMetadataSchema,
    artifactPublishResultSchema,
    artifactVersionsResultSchema,
    inferAttachmentMediaType,
} from '@haus/api';
import * as z from 'zod';
import { applyServerAcceptEncoding } from '../../server-encoding.ts';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { resolveAgentContext } from '../agent-context.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import { readArtifactPublishReceipt, unconfirmedPublish } from './artifact-publish-receipt.ts';

const revisionFlag = {
    name: '--revision-id',
    valueName: '<id>',
    description: 'Read a fixed revision',
};
const base = '/api/agent/artifacts';

export const ARTIFACT_SUBCOMMANDS: SubCommand[] = [
    {
        name: 'publish',
        summary: 'Share a file with this Server or publish a new revision',
        usage: 'haus artifact publish --path <file> [--to <drive-path>] [--title <title>] [--base-revision-id <id> | --replace]',
        positionals: [],
        examples: [
            'haus artifact publish --path ./report.pdf --to reports/q4.pdf',
            'haus artifact publish --path ./report.pdf --to reports/q4.pdf --base-revision-id rev_123',
        ],
        flags: [
            { name: '--path', valueName: '<file>', description: 'Local file to publish' },
            {
                name: '--to',
                valueName: '<drive-path>',
                description: 'Drive path to write (folder/file.ext); defaults to the file name',
            },
            { name: '--title', valueName: '<title>', description: 'Artifact title' },
            {
                name: '--base-revision-id',
                valueName: '<id>',
                description: 'Current head revision an existing path is updated from',
            },
            { name: '--replace', description: 'Overwrite an existing path whatever its head is' },
            {
                name: '--content-type',
                valueName: '<type>',
                description: 'Override inferred media type',
            },
            {
                name: '--request-id',
                valueName: '<id>',
                description: 'Reuse with identical bytes and metadata for a safe retry',
            },
        ],
        notes: [
            'Published files are visible to every member of this Server. Your original file stays in your workspace.',
            'Share the printed stable_url in your message; Haus shows it as an artifact chip. Do not also attach the file.',
        ],
        run: publish,
    },
    {
        name: 'list',
        summary: 'List shared Server artifacts',
        usage: 'haus artifact list [--query <text>] [--mine] [--offset <n>]',
        positionals: [],
        examples: ['haus artifact list --query roadmap', 'haus artifact list --mine'],
        flags: [
            {
                name: '--query',
                valueName: '<text>',
                description: 'Search titles, filenames, and names',
            },
            { name: '--mine', description: 'Only artifacts you created' },
            { name: '--offset', valueName: '<n>', description: 'Pagination offset (50 per page)' },
        ],
        notes: ['Most recently updated first.'],
        run: (args) => runArtifactList(args),
    },
    {
        name: 'get',
        summary: 'Read shared artifact metadata',
        usage: 'haus artifact get <id> [--revision-id <id>]',
        positionals: ['<id>'],
        examples: ['haus artifact get art_123'],
        flags: [revisionFlag],
        run: async (args) =>
            print(
                await createAgentApiClient().request(target(args), artifactPublishResultSchema, {
                    query: revisionQuery(args),
                })
            ),
    },
    {
        name: 'versions',
        summary: 'List retained immutable revisions',
        usage: 'haus artifact versions <id> [--offset <n>]',
        positionals: ['<id>'],
        examples: ['haus artifact versions art_123'],
        flags: [{ name: '--offset', valueName: '<n>', description: 'Pagination offset' }],
        run: async (args) =>
            print(
                await createAgentApiClient().request(
                    `${target(args)}/versions`,
                    artifactVersionsResultSchema,
                    {
                        query: { offset: args.values['--offset'] ?? '0' },
                    }
                )
            ),
    },
    {
        name: 'view',
        summary: 'Resolve a shared file to a read-only cached path',
        usage: 'haus artifact view <id> [--revision-id <id>] [--output <path>]',
        positionals: ['<id>'],
        examples: [
            'haus artifact view art_123',
            'haus artifact view art_123 --output ./editable.pdf',
        ],
        flags: [
            revisionFlag,
            {
                name: '--output',
                valueName: '<path>',
                description: 'Create a writable personal copy at this path',
            },
        ],
        run: async (args) => {
            const result = await createAgentApiClient().request(
                `${target(args)}/view`,
                z.object({ artifact: artifactMetadataSchema, path: z.string().min(1) }),
                { query: revisionQuery(args), timeoutMs: 300_000 }
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
        name: 'delete',
        summary: 'Delete an artifact or one historical revision',
        usage: 'haus artifact delete <id> [--revision-id <id>]',
        positionals: ['<id>'],
        examples: ['haus artifact delete art_123 --revision-id rev_456'],
        flags: [revisionFlag],
        run: async (args) => {
            const revision = args.values['--revision-id'];
            return print(
                await createAgentApiClient().request(
                    revision
                        ? `${target(args)}/versions/${encodeURIComponent(revision)}/delete`
                        : `${target(args)}/delete`,
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
    return print(
        await client.request(base, artifactListResultSchema, {
            query: {
                offset: args.values['--offset'] ?? '0',
                query: args.values['--query'],
                mine: args.flags['--mine'] ? 'true' : undefined,
            },
        })
    );
}

async function publish(args: ParsedArgs): Promise<number> {
    const filePath = args.values['--path'];
    if (!filePath) {
        throw new AgentCliError('INVALID_ARG', 'Provide --path.');
    }
    const file = Bun.file(filePath);
    if (!((await file.exists()) && (await fs.stat(filePath)).isFile())) {
        throw new AgentCliError('INVALID_ARG', 'Publish requires a regular file.');
    }
    if (file.size > 256 * 1024 ** 2) {
        throw new AgentCliError('INVALID_ARG', 'Artifact exceeds the 256 MiB limit.');
    }
    const context = resolveAgentContext();
    const url = new URL(`${base}/publish-artifact-raw`, context.serverUrl);
    const requestId = args.values['--request-id'] ?? randomUUID();
    for (const [key, value] of Object.entries({
        path: args.values['--to'] ?? path.basename(filePath),
        base_revision_id: args.values['--base-revision-id'],
        replace: args.flags['--replace'] ? 'true' : undefined,
        title: args.values['--title'],
        content_type:
            args.values['--content-type'] ??
            inferAttachmentMediaType(
                filePath,
                new Uint8Array(await file.slice(0, 4096).arrayBuffer())
            ),
        request_id: requestId,
    })) {
        if (value) {
            url.searchParams.set(key, value);
        }
    }
    process.stderr.write(`Publish request ID: ${requestId}\n`);
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            body: file,
            headers: applyServerAcceptEncoding(
                new Headers({
                    authorization: `Bearer ${context.token}`,
                    'content-length': String(file.size),
                    'content-type': 'application/octet-stream',
                })
            ),
            signal: AbortSignal.timeout(300_000),
        });
    } catch {
        throw unconfirmedPublish(requestId);
    }
    return print(await readArtifactPublishReceipt(response, requestId));
}

function target(args: ParsedArgs): string {
    const id = args.positionals[0];
    if (!id) {
        throw new AgentCliError('INVALID_ARG', 'An artifact ID is required.');
    }
    return `${base}/${encodeURIComponent(id)}`;
}

function revisionQuery(args: ParsedArgs) {
    return { revision_id: args.values['--revision-id'] };
}
function print(value: unknown): number {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return 0;
}
