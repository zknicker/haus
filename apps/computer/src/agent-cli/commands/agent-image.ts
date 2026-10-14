import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { agentImageGenerationModelsReceiptSchema } from '@haus/api';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import {
    IMAGE_GENERATE_RECIPE,
    type ImageGenerateDeps,
    runImageGenerate,
} from '../image-generate.ts';
import { renderImageModels } from '../image-render.ts';
import {
    DEFAULT_IMAGE_OUT_DIR,
    IMAGE_POLL_INTERVAL_MS,
    IMAGE_WAIT_TIMEOUT_MS,
    runImageWait,
} from '../image-wait.ts';
import type { ParsedArgs } from '../parse.ts';
import { readAgentStdin } from '../stdin.ts';
import type { SubCommand } from '../subcommand.ts';

const MODELS_COMMAND: SubCommand = {
    examples: ['haus image models'],
    flags: [],
    name: 'models',
    positionals: [],
    run: (args) =>
        runImageModels(args, createAgentApiClient(), (text) => process.stdout.write(text)),
    summary: 'List the curated image models, their sizing rules, prices, and availability',
    usage: 'haus image models',
};

const GENERATE_COMMAND: SubCommand = {
    examples: [IMAGE_GENERATE_RECIPE],
    flags: [
        {
            description: 'Registry model id from haus image models',
            name: '--model',
            valueName: '<id>',
        },
        {
            description: 'Exact pixels, for models that take them',
            name: '--size',
            valueName: '<WxH>',
        },
        {
            description: 'Aspect ratio, for models that take aspect plus resolution',
            name: '--aspect',
            valueName: '<A:B>',
        },
        {
            description: 'Resolution class with --aspect',
            name: '--resolution',
            valueName: '<1K|2K|4K>',
        },
        { description: 'Quality level the model lists', name: '--quality', valueName: '<level>' },
        {
            description: 'Background; transparent needs a model that supports it',
            name: '--background',
            valueName: '<opaque|transparent>',
        },
        {
            description: 'Reference image for an edit or style match; repeatable',
            name: '--reference',
            valueName: '<attachment id | path>',
        },
    ],
    name: 'generate',
    notes: [
        'The prompt comes from stdin. One generation is one image; run several for several.',
        'Generate returns at once and never posts. Include the printed Link line in a haus message send now; the card shows progress.',
        'Run haus image wait <id> when you need the file.',
    ],
    positionals: [],
    run: (args) => runImageGenerate(args, defaultDeps()),
    summary: 'Start one image with a curated model and return at once; the prompt comes from stdin',
    usage: 'haus image generate --model <id> [--size <WxH> | --aspect <A:B> --resolution <1K|2K|4K>] [--quality <level>] [--background <opaque|transparent>] [--reference <attachment id | path>]...',
};

const WAIT_COMMAND: SubCommand = {
    examples: ['haus image wait img_1234567890abcdef'],
    flags: [
        {
            description: `Workspace folder for the saved image; default ${DEFAULT_IMAGE_OUT_DIR}`,
            name: '--out',
            valueName: '<dir>',
        },
        {
            description: 'Seconds to wait before giving up; default 300',
            name: '--timeout',
            valueName: '<seconds>',
        },
    ],
    name: 'wait',
    notes: [
        'Saves the finished image in your workspace and prints its model, size, quality, duration, and cost. Safe to run again.',
        'On timeout the generation keeps running on the Server; run wait again.',
    ],
    positionals: ['<id>'],
    run: (args) => runImageWait(args, defaultDeps()),
    summary: 'Wait for a generation to finish and save the image file',
    usage: 'haus image wait <generation id> [--out <dir>] [--timeout <seconds>]',
};

export const IMAGE_SUBCOMMANDS: SubCommand[] = [MODELS_COMMAND, GENERATE_COMMAND, WAIT_COMMAND];

export async function runImageModels(
    _args: ParsedArgs,
    client: AgentApiRequester,
    write: (text: string) => void
): Promise<number> {
    const receipt = await client.request(
        '/api/agent/image-generation/models',
        agentImageGenerationModelsReceiptSchema
    );
    write(renderImageModels(receipt.models));
    return 0;
}

function defaultDeps(): ImageGenerateDeps {
    return {
        client: createAgentApiClient(),
        mintNonce: () => `image-generation-${randomUUID()}`,
        mkdir: async (dir) => {
            await fs.mkdir(dir, { recursive: true });
        },
        now: () => new Date(),
        pollIntervalMs: IMAGE_POLL_INTERVAL_MS,
        readFile: (filePath) => fs.readFile(filePath),
        readStdin: readAgentStdin,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        stat: (filePath) => fs.stat(filePath).catch(() => null),
        stdinIsTty: process.stdin.isTTY === true,
        timeoutMs: IMAGE_WAIT_TIMEOUT_MS,
        write: (text) => process.stdout.write(text),
        writeFile: (filePath, data) => fs.writeFile(filePath, data),
    };
}
