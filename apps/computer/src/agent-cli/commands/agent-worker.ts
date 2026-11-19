import {
    type CloudAgentProvider,
    cloudAgentProviderSchema,
    workerRepositorySchema,
    workerTitleSchema,
    formatTaskTarget,
} from '@haus/api';
import { agentWorkerStartResponseSchema } from '../agent-api-schemas.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import { renderWorkerStart } from '../worker-render.ts';
import {
    agentWorkerCancelReceiptResponseSchema,
    agentWorkerSendReceiptResponseSchema,
} from '../worker-response-schema.ts';
import { requiredValue, taskKeyArgument } from './agent-command-utils.ts';
import { optionalCause } from './agent-message-input.ts';
import { type WorkerDeps, defaultDeps } from './agent-worker-deps.ts';
import { INSPECT_COMMAND, runWorkerInspect } from './agent-worker-inspect.ts';

export { runWorkerInspect };

const START_RECIPE = `haus worker start --task SEC-12 --repo haus/haus --ref main \\
  --title "Fix the flaky delivery test" \\
  --say "Handing the flaky delivery test to a Worker; I will report back here." <<'HAUSMSG'
Reproduce apps/server/test/agent-delivery.test.ts locally, find the race, and open a pull request.
HAUSMSG`;

const TASK_REQUIRED_NEXT_ACTION =
    'Start a Task for this work first (haus task start --target <#channel> --from <messageId> --title <text>), then launch with --task <KEY-n>.';

const START_COMMAND: SubCommand = {
    examples: [START_RECIPE],
    flags: [
        {
            description: 'The Task this work is for; it reports there',
            name: '--task',
            valueName: '<KEY-n>',
        },
        { description: 'Repository as owner/name', name: '--repo', valueName: '<owner/name>' },
        { description: 'Starting ref (branch, tag, or SHA)', name: '--ref', valueName: '<ref>' },
        { description: 'One-line title for the work', name: '--title', valueName: '<text>' },
        { description: 'What you tell the Task you are doing', name: '--say', valueName: '<text>' },
        {
            description: 'Record the trigger or reminder fire the --say post answers',
            name: '--cause',
            valueName: '<fireId>',
        },
        {
            description: "Cloud agent provider; omit for this Computer's default",
            name: '--provider',
            valueName: '<cursor|claude>',
        },
    ],
    name: 'start',
    notes: ['A Worker needs a Task: start one with haus task start first.'],
    positionals: [],
    run: (args) => runWorkerStart(args, defaultDeps()),
    summary: 'Delegate bounded work for a Task to a Worker; the instructions come from stdin',
    usage: 'haus worker start --task <KEY-n> --repo <owner/name> --ref <ref> --title <text> --say <text> [--cause <fireId>] [--provider <cursor|claude>]',
};

const SEND_COMMAND: SubCommand = {
    examples: [
        'printf "Address the review comments." | haus worker send --work caw_9f2c1a0b7d4e6f81',
    ],
    flags: [
        { description: 'Existing work to continue', name: '--work', valueName: '<workId>' },
        { description: 'Replace active work and older queued prompts', name: '--interrupt' },
    ],
    name: 'send',
    positionals: [],
    run: (args) => runWorkerSend(args, defaultDeps()),
    summary: 'Send stdin instructions to the same Worker; queue while busy',
    usage: 'haus worker send --work <workId> [--interrupt]',
};

const STOP_COMMAND: SubCommand = {
    examples: ['haus worker stop --work caw_9f2c1a0b7d4e6f81'],
    flags: [{ description: 'The work to stop', name: '--work', valueName: '<workId>' }],
    name: 'stop',
    positionals: [],
    run: (args) => runWorkerCancel(args, defaultDeps()),
    summary: 'Ask the provider to stop work you delegated',
    usage: 'haus worker stop --work <workId>',
};

const CANCEL_COMMAND: SubCommand = {
    ...STOP_COMMAND,
    examples: ['haus worker cancel --work caw_9f2c1a0b7d4e6f81'],
    name: 'cancel',
    summary: 'Compatibility alias for worker stop',
    usage: 'haus worker cancel --work <workId>',
};

export const WORKER_SUBCOMMANDS: SubCommand[] = [
    START_COMMAND,
    SEND_COMMAND,
    INSPECT_COMMAND,
    STOP_COMMAND,
    CANCEL_COMMAND,
];

export async function runWorkerSend(args: ParsedArgs, deps: WorkerDeps): Promise<number> {
    const workId = requiredValue(args, '--work');
    const instructions = deps.stdinIsTty ? '' : await deps.readStdin();
    if (!instructions.trim()) {
        throw new AgentCliError(
            'MISSING_CONTENT',
            'Follow-up instructions are required on stdin.',
            {
                nextAction: `printf "Address the review comments." | haus worker send --work ${workId}`,
            }
        );
    }
    const receipt = await deps.client.request(
        '/api/agent/workers/send',
        agentWorkerSendReceiptResponseSchema,
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

export async function runWorkerStart(args: ParsedArgs, deps: WorkerDeps): Promise<number> {
    const task = readTask(args);
    const target = formatTaskTarget(task);
    const repository = readRepository(args);
    const title = readTitle(args);
    const content = requiredValue(args, '--say');
    const startingRef = args.values['--ref']?.trim() || null;
    const provider = readProvider(args);
    const cause = optionalCause(args);

    const instructions = deps.stdinIsTty ? '' : await deps.readStdin();
    if (!instructions.trim()) {
        throw new AgentCliError(
            'MISSING_CONTENT',
            'The instructions for the Worker are required on stdin.',
            { nextAction: START_RECIPE }
        );
    }

    const response = await deps.client
        .request('/api/agent/workers', agentWorkerStartResponseSchema, {
            body: {
                ...(cause ? { cause } : {}),
                content: content.trim(),
                instructions: instructions.trimEnd(),
                nonce: deps.mintNonce(),
                ...(provider ? { provider } : {}),
                repository,
                startingRef,
                target,
                task,
                title,
            },
            method: 'POST',
            timeoutMs: 60_000,
        })
        .catch((error: unknown) => {
            if (error instanceof AgentCliError && error.code === 'WORKER_TASK_REQUIRED') {
                throw taskRequired(error.message);
            }
            throw error;
        });

    deps.write(renderWorkerStart(response, { repository, startingRef, target }));
    return 0;
}

function readTask(args: ParsedArgs): string {
    if (!args.values['--task']?.trim()) {
        throw taskRequired('A Worker works for a Task, and this launch named none.');
    }
    return taskKeyArgument(args.values['--task'], '--task');
}

function taskRequired(message: string): AgentCliError {
    return new AgentCliError('WORKER_TASK_REQUIRED', message, {
        nextAction: TASK_REQUIRED_NEXT_ACTION,
    });
}

export async function runWorkerCancel(args: ParsedArgs, deps: WorkerDeps): Promise<number> {
    const workId = requiredValue(args, '--work');
    const receipt = await deps.client.request(
        '/api/agent/workers/cancel',
        agentWorkerCancelReceiptResponseSchema,
        { body: { workId }, method: 'POST' }
    );
    deps.write(
        `Cancel requested for ${receipt.work.title} (${receipt.work.id}). The run settles as cancelled when the provider stops.\n`
    );
    return 0;
}

function readRepository(args: ParsedArgs): string {
    const raw = requiredValue(args, '--repo');
    const parsed = workerRepositorySchema.safeParse(raw);
    if (!parsed.success) {
        throw new AgentCliError('INVALID_ARG', `Invalid repository "${raw}".`, {
            nextAction: 'Use --repo owner/name, for example --repo haus/haus.',
        });
    }
    return parsed.data;
}

function readTitle(args: ParsedArgs): string {
    const raw = requiredValue(args, '--title');
    const parsed = workerTitleSchema.safeParse(raw);
    if (!parsed.success) {
        throw new AgentCliError('INVALID_ARG', 'The title must be 1 to 120 characters.', {
            nextAction: 'Give the work one short title a human can scan.',
        });
    }
    return parsed.data;
}

function readProvider(args: ParsedArgs): CloudAgentProvider | undefined {
    const raw = args.values['--provider'];
    if (raw === undefined) {
        return;
    }
    const parsed = cloudAgentProviderSchema.safeParse(raw.trim());
    if (!parsed.success) {
        throw new AgentCliError('INVALID_ARG', `Invalid cloud agent provider "${raw}".`, {
            nextAction: 'Use --provider cursor or --provider claude, or omit it for the default.',
        });
    }
    return parsed.data;
}
