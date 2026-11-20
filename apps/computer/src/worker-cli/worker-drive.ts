import { writeFile } from 'node:fs/promises';
import * as z from 'zod';
import { AgentCliError } from '../agent-cli/agent-error.ts';
import type { ParsedArgs } from '../agent-cli/parse.ts';
import type { SubCommand } from '../agent-cli/subcommand.ts';
import type { WorkerCliDeps } from './worker-report.ts';

const headSchema = z.looseObject({
    artifact: z.looseObject({ artifact_id: z.string().min(1), revision_id: z.string().min(1) }),
});
const downloadSchema = z.looseObject({ download_url: z.string().url() });

export function driveViewCommand(deps: () => WorkerCliDeps & { fetch: typeof fetch }) {
    return {
        examples: [
            'haus drive view haus/AGENTS.md',
            'haus drive view agents/forge/reports/SEC-12/race.md --revision-id rev_123 --output race.md',
        ],
        flags: [
            { description: 'A fixed revision', name: '--revision-id', valueName: '<id>' },
            {
                description: 'Write the file here instead of stdout',
                name: '--output',
                valueName: '<path>',
            },
        ],
        name: 'view',
        notes: ['The current version of every Drive file is also in your drive/ folder.'],
        positionals: ['<path>'],
        run: (args) => runDriveView(args, deps()),
        summary: 'Read a Drive file, or one fixed revision of it, by path',
        usage: 'haus drive view <path> [--revision-id <id>] [--output <path>]',
    } satisfies SubCommand;
}

export async function runDriveView(
    args: ParsedArgs,
    deps: WorkerCliDeps & { fetch: typeof fetch }
) {
    const path = args.positionals[0];
    if (!path) {
        throw new AgentCliError('INVALID_ARG', 'Name the Drive path to read.', {
            nextAction: 'haus drive view haus/AGENTS.md',
        });
    }
    const { artifact } = await deps.client.request('/api/agent/artifacts/by-path', headSchema, {
        query: { path },
    });
    const { download_url } = await deps.client.request(
        `/api/agent/artifacts/${encodeURIComponent(artifact.artifact_id)}/download`,
        downloadSchema,
        { query: { revision_id: args.values['--revision-id'] ?? artifact.revision_id } }
    );
    const response = await deps.fetch(download_url, { signal: AbortSignal.timeout(300_000) });
    if (!response.ok) {
        throw new AgentCliError(
            'READ_FAILED',
            `Downloading ${path} failed with ${response.status}.`
        );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const output = args.values['--output'];
    if (output) {
        await writeFile(output, bytes, { flag: 'wx', mode: 0o600 });
        deps.write(`Wrote ${path} to ${output}.\n`);
    } else {
        deps.write(bytes);
    }
    return 0;
}
