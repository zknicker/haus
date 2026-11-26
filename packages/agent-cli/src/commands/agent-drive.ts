import fs from 'node:fs/promises';
import path from 'node:path';
import * as z from 'zod';
import { createAgentApiClient } from '../agent-api-client.ts';
import {
    artifactMetadataResponseSchema,
    artifactVersionsResultResponseSchema,
} from '../artifact-drive-response-schema.ts';
import type { SubCommand } from '../subcommand.ts';
import { DRIVE_WRITE_SUBCOMMAND } from './agent-drive-write.ts';
import { ARTIFACT_SHARE_SUBCOMMAND } from './artifact-share.ts';
import { artifactRoute, resolveArtifactId } from './artifact-target.ts';

const targetPositional = '<id|link|path>';

export const DRIVE_SUBCOMMANDS: SubCommand[] = [
    {
        name: 'versions',
        summary: 'List a Drive file’s retained revisions',
        usage: `haus drive versions ${targetPositional} [--offset <n>]`,
        positionals: [targetPositional],
        examples: ['haus drive versions haus/reports/q4.md'],
        flags: [{ name: '--offset', valueName: '<n>', description: 'Pagination offset' }],
        run: async (args) => {
            const client = createAgentApiClient();
            const id = await resolveArtifactId(client, args.positionals[0]);
            return print(
                await client.request(
                    artifactRoute(id, '/versions'),
                    artifactVersionsResultResponseSchema,
                    { query: { offset: args.values['--offset'] ?? '0' } }
                )
            );
        },
    },
    {
        name: 'view',
        summary: 'Read a Drive file, or one fixed revision, through a read-only cached path',
        usage: `haus drive view ${targetPositional} [--revision-id <id>] [--output <path>]`,
        positionals: [targetPositional],
        examples: [
            'haus drive view haus/reports/q4.md --revision-id rev_123',
            'haus drive view https://haus.chat/s/demo/artifacts/art_123 --output ./q4.pdf',
        ],
        flags: [
            { name: '--revision-id', valueName: '<id>', description: 'A fixed revision' },
            {
                name: '--output',
                valueName: '<path>',
                description: 'Also write a personal copy here',
            },
        ],
        notes: [
            'The current version is also in your drive/ folder; view is for links and history.',
        ],
        run: async (args) => {
            const client = createAgentApiClient();
            const id = await resolveArtifactId(client, args.positionals[0]);
            const result = await client.request(
                artifactRoute(id, '/view'),
                z.object({ artifact: artifactMetadataResponseSchema, path: z.string().min(1) }),
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
    ARTIFACT_SHARE_SUBCOMMAND,
    DRIVE_WRITE_SUBCOMMAND,
];

function print(value: unknown) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return 0;
}
