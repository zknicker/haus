import fs from 'node:fs/promises';
import path from 'node:path';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import {
    agentAttachmentUploadResponseSchema,
    agentAttachmentViewResponseSchema,
} from '../agent-api-schemas.ts';
import { AgentCliError } from '../agent-error.ts';
import { inferAttachmentMediaType } from '../attachment-media-type.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

interface AttachmentDeps {
    client: AgentApiRequester;
    readFile(filePath: string): Promise<Buffer>;
    stat(filePath: string): Promise<{ isFile(): boolean; size: number }>;
    write(text: string): void;
    writeFile(filePath: string, data: Buffer): Promise<void>;
}

export const ATTACHMENT_SUBCOMMANDS: SubCommand[] = [
    {
        examples: ['haus attachment upload --path ./chart.png'],
        flags: [
            { description: 'Local file to upload', name: '--path', valueName: '<file>' },
            {
                description: 'Media type; inferred from the file when omitted',
                name: '--mime-type',
                valueName: '<type>',
            },
        ],
        name: 'upload',
        positionals: [],
        run: (args) => runAttachmentUpload(args, defaultDeps()),
        summary: 'Upload a local file for a later message send',
        usage: 'haus attachment upload --path <file> [--mime-type <mt>]',
    },
    {
        examples: ['haus attachment view att_1a2b3c --output ./report.pdf'],
        flags: [{ description: 'Saved file path', name: '--output', valueName: '<path>' }],
        name: 'view',
        positionals: ['<id>'],
        run: (args) => runAttachmentView(args, defaultDeps()),
        summary: 'Download an attachment by id',
        usage: 'haus attachment view <id> [--output <path>]',
    },
];

export async function runAttachmentUpload(args: ParsedArgs, deps: AttachmentDeps): Promise<number> {
    const filePath = args.values['--path'];
    if (!filePath) {
        throw new AgentCliError('INVALID_ARG', 'Provide --path with a local file.');
    }
    let stats: Awaited<ReturnType<AttachmentDeps['stat']>>;
    try {
        stats = await deps.stat(filePath);
    } catch {
        throw new AgentCliError('INVALID_ARG', `File ${filePath} was not found.`);
    }
    if (!stats.isFile()) {
        throw new AgentCliError('INVALID_ARG', `${filePath} is not a file.`);
    }
    if (stats.size > MAX_ATTACHMENT_BYTES) {
        throw new AgentCliError('INVALID_ARG', 'Attachment exceeds the 50MB limit.');
    }
    const data = await deps.readFile(filePath).catch(() => {
        throw new AgentCliError('INVALID_ARG', `File ${filePath} could not be read.`);
    });
    if (data.byteLength > MAX_ATTACHMENT_BYTES) {
        throw new AgentCliError('INVALID_ARG', 'Attachment exceeds the 50MB limit.');
    }
    // Unlike Raft, upload is independent of a target; message send attaches it later.
    const response = await deps.client.request(
        '/api/agent/attachments/upload',
        agentAttachmentUploadResponseSchema,
        {
            body: {
                dataBase64: data.toString('base64'),
                filename: path.basename(filePath),
                mediaType:
                    args.values['--mime-type']?.trim() || inferAttachmentMediaType(filePath, data),
            },
            method: 'POST',
        }
    );
    const attachment = response.attachment;
    deps.write(`Uploaded ${attachment.filename}. Attachment ID: ${attachment.id}\n`);
    deps.write(
        `Attach it to a message: haus message send --target <t> --attachment-id ${attachment.id}\n`
    );
    return 0;
}

export async function runAttachmentView(args: ParsedArgs, deps: AttachmentDeps): Promise<number> {
    const id = args.positionals[0];
    if (!id) {
        throw new AgentCliError('INVALID_ARG', 'An attachment id is required.');
    }
    const response = await deps.client.request(
        `/api/agent/attachments/${encodeURIComponent(id)}`,
        agentAttachmentViewResponseSchema
    );
    const outputPath = args.values['--output'] ?? `./${response.attachment.filename}`;
    await deps.writeFile(outputPath, Buffer.from(response.attachment.dataBase64, 'base64'));
    deps.write(`Saved attachment to ${outputPath}.\n`);
    return 0;
}

function defaultDeps(): AttachmentDeps {
    return {
        client: createAgentApiClient(),
        readFile: (filePath) => fs.readFile(filePath),
        stat: (filePath) => fs.stat(filePath),
        write: (text) => process.stdout.write(text),
        writeFile: (filePath, data) => fs.writeFile(filePath, data),
    };
}
