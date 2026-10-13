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
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { resolveAgentContext } from '../agent-context.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';

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
        usage: 'haus artifact publish --path <file> --title <title> (--name <name> | --artifact-id <id>)',
        positionals: [],
        examples: ['haus artifact publish --path ./report.pdf --name report --title "Report"'],
        flags: [
            { name: '--path', valueName: '<file>', description: 'Local file to publish' },
            { name: '--title', valueName: '<title>', description: 'Artifact title' },
            {
                name: '--name',
                valueName: '<name>',
                description: 'Server-scoped name for a new artifact',
            },
            {
                name: '--artifact-id',
                valueName: '<id>',
                description: 'Existing artifact receiving a new revision',
            },
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
    const title = args.values['--title'];
    if (!(filePath && title)) {
        throw new AgentCliError('INVALID_ARG', 'Provide --path and --title.');
    }
    const file = Bun.file(filePath);
    if (!((await file.exists()) && (await fs.stat(filePath)).isFile())) {
        throw new AgentCliError('INVALID_ARG', 'Publish requires a regular file.');
    }
    if (file.size > 256 * 1024 ** 2) {
        throw new AgentCliError('INVALID_ARG', 'Artifact exceeds the 256 MiB limit.');
    }
    const name = args.values['--name'];
    const artifactId = args.values['--artifact-id'];
    if (Boolean(name) === Boolean(artifactId)) {
        throw new AgentCliError('INVALID_ARG', 'Provide exactly one of --name or --artifact-id.');
    }
    const context = resolveAgentContext();
    const url = new URL(`${base}/publish-artifact-raw`, context.serverUrl);
    const requestId = args.values['--request-id'] ?? randomUUID();
    for (const [key, value] of Object.entries({
        name,
        artifact_id: artifactId,
        title,
        filename: path.basename(filePath),
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
    const response = await fetch(url, {
        method: 'POST',
        body: file,
        headers: {
            authorization: `Bearer ${context.token}`,
            'content-type': 'application/octet-stream',
            'content-length': String(file.size),
        },
        signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok) {
        throw new AgentCliError(
            'ARTIFACT_PUBLISH_FAILED',
            `Publishing failed (${response.status}): ${await response.text()}`
        );
    }
    return print(artifactPublishResultSchema.parse(await response.json()));
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
