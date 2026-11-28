import { createAgentApiClient } from '../agent-api-client.ts';
import { artifactVersionsResultResponseSchema } from '../artifact-drive-response-schema.ts';
import type { SubCommand } from '../subcommand.ts';
import { DRIVE_VIEW_SUBCOMMAND } from './agent-drive-view.ts';
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
    DRIVE_VIEW_SUBCOMMAND,
    ARTIFACT_SHARE_SUBCOMMAND,
    DRIVE_WRITE_SUBCOMMAND,
];

function print(value: unknown) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return 0;
}
