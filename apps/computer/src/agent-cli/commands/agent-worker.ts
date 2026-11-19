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

const START_RECIPE = `haus worker start --task SEC-12 --on cursor --repo haus/haus --ref main \\
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
        { description: 'Where the Worker runs', name: '--on', valueName: '<cursor|claude>' },
        { description: 'Repository as owner/name', name: '--repo', valueName: '<owner/name>' },
        { description: 'Starting ref (branch, tag, or SHA)', name: '--ref', valueName: '<ref>' },
        { description: 'One-line title for the work', name: '--title', valueName: '<text>' },
        { description: 'What you tell the Task you are doing', name: '--say', valueName: '<text>' },
        {
            description: 'Record the trigger or reminder fire the --say post answers',
            name: '--cause',
            valueName: '<fireId>',
        },
    ],
    name: 'start',
    notes: ['A Worker needs a Task: start one with haus task start first.'],
    positionals: [],
    run: (args) => runWorkerStart(args, defaultDeps()),
    summary: 'Delegate bounded work for a Task to a Worker; the instructions come from stdin',
    usage: 'haus worker start --task <KEY-n> --on <cursor|claude> --repo <owner/name> --ref <ref> --title <text> --say <text> [--cause <fireId>]',
};

const SEND_COMMAND: SubCommand = {
    examples: [
        'printf "Address the review comments." | haus worker send --worker caw_9f2c1a0b7d4e6f81',
    ],
    flags: [
        { description: 'The Worker to continue', name: '--worker', valueName: '<workerId>' },
        { description: 'Replace active work and older queued prompts', name: '--interrupt' },
    ],
    name: 'send',
    positionals: [],
    run: (args) => runWorkerSend(args, defaultDeps()),
    summary: 'Send stdin instructions to the same Worker; queue while busy',
    usage: 'haus worker send --worker <workerId> [--interrupt]',
};

const STOP_COMMAND: SubCommand = {
    examples: ['haus worker stop --worker caw_9f2c1a0b7d4e6f81'],
    flags: [{ description: 'The Worker to stop', name: '--worker', valueName: '<workerId>' }],
    name: 'stop',
    positionals: [],
    run: (args) => runWorkerStop(args, defaultDeps()),
    summary: 'Ask the provider to stop a Worker you delegated',
    usage: 'haus worker stop --worker <workerId>',
};

export const WORKER_SUBCOMMANDS: SubCommand[] = [
    START_COMMAND,
    SEND_COMMAND,
    INSPECT_COMMAND,
    STOP_COMMAND,
];

export async function runWorkerSend(args: ParsedArgs, deps: WorkerDeps): Promise<number> {
    const workerId = requiredValue(args, '--worker');
    const instructions = deps.stdinIsTty ? '' : await deps.readStdin();
    if (!instructions.trim()) {
        throw new AgentCliError(
            'MISSING_CONTENT',
            'Follow-up instructions are required on stdin.',
            {
                nextAction: `printf "Address the review comments." | haus worker send --worker ${workerId}`,
            }
        );
    }
    const receipt = await deps.client.request(
        '/api/agent/workers/send',
        agentWorkerSendReceiptResponseSchema,
        {
            body: {
                workerId,
                instructions: instructions.trimEnd(),
                nonce: deps.mintNonce(),
                interrupt: args.flags['--interrupt'] === true,
            },
            method: 'POST',
            timeoutMs: 60_000,
        }
    );
    deps.write(
        `Follow-up accepted for ${receipt.worker.title}. Work ID: ${receipt.worker.id}\nThe result reaches your inbox when this follow-up settles. Use this Work ID for further revisions.\n`
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
    const provider = readPlace(args);
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
                provider,
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

export async function runWorkerStop(args: ParsedArgs, deps: WorkerDeps): Promise<number> {
    const workerId = requiredValue(args, '--worker');
    const receipt = await deps.client.request(
        '/api/agent/workers/cancel',
        agentWorkerCancelReceiptResponseSchema,
        { body: { workerId }, method: 'POST' }
    );
    deps.write(
        `Cancel requested for ${receipt.worker.title} (${receipt.worker.id}). The run settles as cancelled when the provider stops.\n`
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

function readPlace(args: ParsedArgs): CloudAgentProvider {
    const raw = args.values['--on']?.trim();
    if (!raw) {
        throw new AgentCliError('WORKER_PLACE_REQUIRED', 'A Worker start names where it runs.', {
            nextAction: 'Add --on cursor or --on claude.',
        });
    }
    const parsed = cloudAgentProviderSchema.safeParse(raw);
    if (!parsed.success) {
        throw new AgentCliError('INVALID_ARG', `Invalid Worker place "${raw}".`, {
            nextAction: 'Use --on cursor or --on claude.',
        });
    }
    return parsed.data;
}
