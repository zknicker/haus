import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import {
    agentDriveWriteResultSchema,
    DRIVE_WRITE_MAX_BYTES,
    inferAttachmentMediaType,
} from '@haus/api';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { readAgentStdinBytes } from '../stdin.ts';
import type { SubCommand } from '../subcommand.ts';

export interface DriveWriteDeps {
    client: AgentApiRequester;
    readFile(filePath: string): Promise<Buffer>;
    readStdin(): Promise<Buffer>;
    write(text: string): void;
}

export const DRIVE_WRITE_SUBCOMMAND: SubCommand = {
    examples: [
        'haus drive write agents/orbit/reports/k3mq7xta/report.md < report.md',
        'haus drive write agents/orbit/renders/k3mq7xta/chart.png --from ./chart.png',
    ],
    flags: [
        {
            description: 'A file on your Machine to send instead of stdin',
            name: '--from',
            valueName: '<file>',
        },
    ],
    name: 'write',
    notes: [
        'For Tasks: writes one file under your own reports/, renders/ or handoffs/ folder (a person’s Task: projects/<key>/tasks/<id>/) as a new revision.',
        'Captains edit Drive in their drive/ folder instead.',
    ],
    positionals: ['<path>'],
    run: (args) => runDriveWrite(args, defaultDeps()),
    summary: 'Write a Task deliverable to Drive',
    usage: 'haus drive write <path> [--from <file>] [< file]',
};

export async function runDriveWrite(args: ParsedArgs, deps: DriveWriteDeps) {
    const path = args.positionals[0];
    if (!path) {
        throw new AgentCliError('INVALID_ARG', 'Name the Drive path to write.', {
            nextAction: 'haus drive write agents/<captain>/reports/<task id>/report.md < report.md',
        });
    }
    const from = args.values['--from'];
    const content = from ? await readFrom(deps, from) : await deps.readStdin();
    if (content.byteLength === 0) {
        throw new AgentCliError('INVALID_ARG', 'Give the file on stdin or with --from.');
    }
    if (content.byteLength > DRIVE_WRITE_MAX_BYTES) {
        throw new AgentCliError('INVALID_ARG', 'haus drive write sends at most 50 MB.');
    }
    const { artifact, citation } = await deps.client.request(
        '/api/agent/drive/write',
        agentDriveWriteResultSchema,
        {
            body: {
                contentBase64: content.toString('base64'),
                contentType: inferAttachmentMediaType(from ?? path, content),
                path,
                requestId: randomUUID(),
            },
            method: 'POST',
            timeoutMs: 300_000,
        }
    );
    deps.write(
        `Wrote ${artifact.path} (revision ${artifact.revision_number}). Cite it: ${citation}\n`
    );
    return 0;
}

async function readFrom(deps: DriveWriteDeps, from: string) {
    return await deps.readFile(from).catch(() => {
        throw new AgentCliError('INVALID_ARG', `File ${from} could not be read.`);
    });
}

function defaultDeps() {
    const deps: DriveWriteDeps = {
        client: createAgentApiClient(),
        readFile: (filePath) => fs.readFile(filePath),
        readStdin: readAgentStdinBytes,
        write: (text) => process.stdout.write(text),
    };
    return deps;
}
