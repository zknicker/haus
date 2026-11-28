import fs from 'node:fs/promises';
import * as z from 'zod';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import { artifactRoute, resolveArtifactId } from './artifact-target.ts';

export interface DriveViewDeps {
    client: AgentApiRequester;
    fetchBytes(url: string): Promise<Buffer>;
    write(text: string): void;
    writeFile(filePath: string, bytes: Buffer): Promise<void>;
}

const targetPositional = '<id|link|path>';
const downloadSchema = z.looseObject({ download_url: z.string().min(1) });

export const DRIVE_VIEW_SUBCOMMAND: SubCommand = {
    examples: [
        'haus drive view projects/GEN/AGENTS.md',
        'haus drive view haus/reports/q4.md --revision-id rev_123',
        'haus drive view agents/orbit/renders/k3mq7xta/chart.png --output ./chart.png',
    ],
    flags: [
        { description: 'A fixed revision', name: '--revision-id', valueName: '<id>' },
        {
            description: 'Save the file on your Machine instead of printing it',
            name: '--output',
            valueName: '<path>',
        },
    ],
    name: 'view',
    notes: [
        'Prints a text file. Save any other file with --output.',
        'Tasks read Drive this way. Captains also have the current version in their drive/ folder.',
    ],
    positionals: [targetPositional],
    run: (args) => runDriveView(args, defaultDeps()),
    summary: 'Read a Drive file, or one fixed revision',
    usage: `haus drive view ${targetPositional} [--revision-id <id>] [--output <path>]`,
};

export async function runDriveView(args: ParsedArgs, deps: DriveViewDeps) {
    const target = args.positionals[0];
    const id = await resolveArtifactId(deps.client, target);
    const { download_url: url } = await deps.client.request(
        artifactRoute(id, '/download'),
        downloadSchema,
        { query: { revision_id: args.values['--revision-id'] } }
    );
    const bytes = await deps.fetchBytes(url);
    const output = args.values['--output'];
    if (output) {
        await deps.writeFile(output, bytes);
        deps.write(`Saved ${target} to ${output}.\n`);
        return 0;
    }
    deps.write(textOf(target ?? id, bytes));
    return 0;
}

function textOf(target: string, bytes: Buffer) {
    const text = (() => {
        try {
            return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
            return null;
        }
    })();
    if (text === null || text.includes('\u0000')) {
        throw new AgentCliError('INVALID_ARG', `${target} is not text, so it does not print.`, {
            nextAction: `haus drive view ${target} --output <path>`,
        });
    }
    return text.endsWith('\n') || text === '' ? text : `${text}\n`;
}

function defaultDeps() {
    const deps: DriveViewDeps = {
        client: createAgentApiClient(),
        fetchBytes: async (url) => {
            const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
            if (!response.ok) {
                throw new AgentCliError(
                    'READ_FAILED',
                    `Downloading the file failed with HTTP ${response.status}.`
                );
            }
            return Buffer.from(await response.arrayBuffer());
        },
        write: (text) => process.stdout.write(text),
        writeFile: (filePath, bytes) => fs.writeFile(filePath, bytes, { mode: 0o600 }),
    };
    return deps;
}
