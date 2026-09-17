import { randomUUID } from 'node:crypto';
import {
    agentCloudAgentCancelReceiptSchema,
    agentCloudAgentListReceiptSchema,
    agentCloudAgentReceiptSchema,
    agentCloudAgentSendReceiptSchema,
    cloudAgentRepositorySchema,
    cloudAgentTitleSchema,
} from '@haus/api';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import { shortMessageId } from '../agent-format.ts';
import { isThreadTarget } from '../agent-render.ts';
import type { ParsedArgs } from '../parse.ts';
import { readAgentStdin } from '../stdin.ts';
import type { SubCommand } from '../subcommand.ts';
import { assertAgentTarget, requiredValue } from './agent-command-utils.ts';

const START_RECIPE = `haus cloud-agent start --target "#product" --repo haus/haus --ref main \\
  --title "Fix the flaky delivery test" \\
  --say "Handing the flaky delivery test to a cloud agent; I will report back." <<'HAUSMSG'
Reproduce apps/server/test/agent-delivery.test.ts locally, find the race, and open a pull request.
HAUSMSG`;

interface CloudAgentDeps {
    client: AgentApiRequester;
    mintNonce(): string;
    readStdin(): Promise<string>;
    stdinIsTty: boolean;
    write(text: string): void;
}

const START_COMMAND: SubCommand = {
    examples: [START_RECIPE],
    flags: [
        { description: 'Channel, DM, or thread target', name: '--target', valueName: '<target>' },
        {
            description: 'Message this card replies to inline',
            name: '--reply-to',
            valueName: '<messageId>',
        },
        { description: 'Repository as owner/name', name: '--repo', valueName: '<owner/name>' },
        { description: 'Starting ref (branch, tag, or SHA)', name: '--ref', valueName: '<ref>' },
        { description: 'One-line title for the work', name: '--title', valueName: '<text>' },
        { description: 'What you tell the chat you are doing', name: '--say', valueName: '<text>' },
    ],
    name: 'start',
    positionals: [],
    run: (args) => runCloudAgentStart(args, defaultDeps()),
    summary: 'Delegate bounded work to a cloud agent; the instructions come from stdin',
    usage: 'haus cloud-agent start --target <target> [--reply-to <messageId>] --repo <owner/name> --ref <ref> --title <text> --say <text>',
};

const SEND_COMMAND: SubCommand = {
    examples: [
        'printf "Address the review comments." | haus cloud-agent send --work caw_9f2c1a0b7d4e6f81',
    ],
    flags: [
        { description: 'Existing work to continue', name: '--work', valueName: '<workId>' },
        { description: 'Replace active work and older queued prompts', name: '--interrupt' },
    ],
    name: 'send',
    positionals: [],
    run: (args) => runCloudAgentSend(args, defaultDeps()),
    summary: 'Send stdin instructions to the same cloud agent; queue while busy',
    usage: 'haus cloud-agent send --work <workId> [--interrupt]',
};

const INSPECT_COMMAND: SubCommand = {
    examples: ['haus cloud-agent inspect', 'haus cloud-agent inspect --work caw_9f2c1a0b7d4e6f81'],
    flags: [
        {
            description: 'Work to inspect; omit to list your work',
            name: '--work',
            valueName: '<workId>',
        },
    ],
    name: 'inspect',
    positionals: [],
    run: (args) => runCloudAgentInspect(args, defaultDeps()),
    summary: 'Inspect your cloud agent work and its recorded results',
    usage: 'haus cloud-agent inspect [--work <workId>]',
};

const STOP_COMMAND: SubCommand = {
    examples: ['haus cloud-agent stop --work caw_9f2c1a0b7d4e6f81'],
    flags: [{ description: 'The work to stop', name: '--work', valueName: '<workId>' }],
    name: 'stop',
    positionals: [],
    run: (args) => runCloudAgentCancel(args, defaultDeps()),
    summary: 'Ask the provider to stop work you delegated',
    usage: 'haus cloud-agent stop --work <workId>',
};

const CANCEL_COMMAND: SubCommand = {
    ...STOP_COMMAND,
    examples: ['haus cloud-agent cancel --work caw_9f2c1a0b7d4e6f81'],
    name: 'cancel',
    summary: 'Compatibility alias for cloud-agent stop',
    usage: 'haus cloud-agent cancel --work <workId>',
};

export const CLOUD_AGENT_SUBCOMMANDS: SubCommand[] = [
    START_COMMAND,
    SEND_COMMAND,
    INSPECT_COMMAND,
    STOP_COMMAND,
    CANCEL_COMMAND,
];

export async function runCloudAgentSend(args: ParsedArgs, deps: CloudAgentDeps): Promise<number> {
    const workId = requiredValue(args, '--work');
    const instructions = deps.stdinIsTty ? '' : await deps.readStdin();
    if (!instructions.trim()) {
        throw new AgentCliError(
            'MISSING_CONTENT',
            'Follow-up instructions are required on stdin.',
            {
                nextAction: `printf "Address the review comments." | haus cloud-agent send --work ${workId}`,
            }
        );
    }
    const receipt = await deps.client.request(
        '/api/agent/cloud-agents/send',
        agentCloudAgentSendReceiptSchema,
        {
            body: {
                workId,
                instructions: instructions.trimEnd(),
                nonce: deps.mintNonce(),
                interrupt: args.flags['--interrupt'] === true,
            },
            method: 'POST',
            timeoutMs: 60_000,
        }
    );
    deps.write(
        `Follow-up accepted for ${receipt.work.title}. Work ID: ${receipt.work.id}\nThe result reaches your inbox when this follow-up settles. Use this Work ID for further revisions.\n`
    );
    return 0;
}

export async function runCloudAgentInspect(
    args: ParsedArgs,
    deps: CloudAgentDeps
): Promise<number> {
    const workId = args.values['--work']?.trim();
    const { works } = await deps.client.request(
        '/api/agent/cloud-agents',
        agentCloudAgentListReceiptSchema,
        { query: { workId } }
    );
    if (workId) {
        deps.write(`${JSON.stringify(works, null, 2)}\n`);
    } else {
        deps.write(
            works.length
                ? `${works.map((work) => `${work.id} [${work.status}] ${work.title} (${work.repository})`).join('\n')}\n`
                : 'No cloud agent work found.\n'
        );
    }
    return 0;
}

export async function runCloudAgentStart(args: ParsedArgs, deps: CloudAgentDeps): Promise<number> {
    const target = requiredValue(args, '--target');
    assertAgentTarget(target);
    const repository = readRepository(args);
    const title = readTitle(args);
    const content = requiredValue(args, '--say');
    const startingRef = args.values['--ref']?.trim() || null;
    const replyToMessageId =
        args.values['--reply-to'] === undefined ? undefined : requiredValue(args, '--reply-to');

    const instructions = deps.stdinIsTty ? '' : await deps.readStdin();
    if (!instructions.trim()) {
        throw new AgentCliError(
            'MISSING_CONTENT',
            'The instructions for the cloud agent are required on stdin.',
            { nextAction: START_RECIPE }
        );
    }

    const receipt = await deps.client.request(
        '/api/agent/cloud-agents',
        agentCloudAgentReceiptSchema,
        {
            body: {
                content: content.trim(),
                instructions: instructions.trimEnd(),
                nonce: deps.mintNonce(),
                repository,
                ...(replyToMessageId ? { replyToMessageId } : {}),
                startingRef,
                target,
                title,
            },
            method: 'POST',
            timeoutMs: 60_000,
        }
    );

    const lines = [
        `Cloud agent started for ${repository}${startingRef ? `@${startingRef}` : ''}. Work ID: ${receipt.work.id}`,
        `Posted to ${receipt.target}. Message ID: ${receipt.messageId}`,
    ];
    lines.push(
        isThreadTarget(receipt.target)
            ? `Work thread: "${receipt.target}".`
            : `Work thread: "${receipt.target}:${shortMessageId(receipt.messageId)}".`
    );
    lines.push('The result reaches your inbox when the run settles; post what you learn yourself.');
    deps.write(`${lines.join('\n')}\n`);
    return 0;
}

export async function runCloudAgentCancel(args: ParsedArgs, deps: CloudAgentDeps): Promise<number> {
    const workId = requiredValue(args, '--work');
    const receipt = await deps.client.request(
        '/api/agent/cloud-agents/cancel',
        agentCloudAgentCancelReceiptSchema,
        { body: { workId }, method: 'POST' }
    );
    deps.write(
        `Cancel requested for ${receipt.work.title} (${receipt.work.id}). The run settles as cancelled when the provider stops.\n`
    );
    return 0;
}

function readRepository(args: ParsedArgs): string {
    const raw = requiredValue(args, '--repo');
    const parsed = cloudAgentRepositorySchema.safeParse(raw);
    if (!parsed.success) {
        throw new AgentCliError('INVALID_ARG', `Invalid repository "${raw}".`, {
            nextAction: 'Use --repo owner/name, for example --repo haus/haus.',
        });
    }
    return parsed.data;
}

function readTitle(args: ParsedArgs): string {
    const raw = requiredValue(args, '--title');
    const parsed = cloudAgentTitleSchema.safeParse(raw);
    if (!parsed.success) {
        throw new AgentCliError('INVALID_ARG', 'The title must be 1 to 120 characters.', {
            nextAction: 'Give the work one short title a human can scan.',
        });
    }
    return parsed.data;
}

function defaultDeps(): CloudAgentDeps {
    return {
        client: createAgentApiClient(),
        mintNonce: () => `cloud-agent-${randomUUID()}`,
        readStdin: readAgentStdin,
        stdinIsTty: process.stdin.isTTY === true,
        write: (text) => process.stdout.write(text),
    };
}
