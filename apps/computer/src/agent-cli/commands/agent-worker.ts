import {
    formatTaskTarget,
    workerPlaceSchema,
    workerRepositorySchema,
    workerTitleSchema,
} from '@haus/api';
import { agentWorkerStartResponseSchema } from '../agent-api-schemas.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import { renderWorkerSend, renderWorkerStart, renderWorkerStop } from '../worker-render.ts';
import {
    agentWorkerSendReceiptResponseSchema,
    agentWorkerStopReceiptResponseSchema,
} from '../worker-response-schema.ts';
import { requiredValue, taskKeyArgument } from './agent-command-utils.ts';
import { type WorkerDeps, defaultDeps } from './agent-worker-deps.ts';
import { INSPECT_COMMAND, runWorkerInspect } from './agent-worker-inspect.ts';

export { runWorkerInspect };

const START_RECIPE = `haus worker start --task SEC-12 --on cursor --repo haus/haus --ref main \\
  --title "Fix the flaky delivery test" <<'HAUSMSG'
Reproduce apps/server/test/agent-delivery.test.ts locally, find the race, and open a pull request.
HAUSMSG`;

const TASK_REQUIRED_NEXT_ACTION =
    'Start a Task for this work first (haus task start --target <#channel> --from <messageId> --title <text>), then start the Worker with --task <KEY-n>.';

const START_COMMAND: SubCommand = {
    examples: [START_RECIPE],
    flags: [
        { description: 'The Task this Worker is for', name: '--task', valueName: '<KEY-n>' },
        { description: 'Where the Worker runs', name: '--on', valueName: '<cursor|claude>' },
        { description: 'Repository as owner/name', name: '--repo', valueName: '<owner/name>' },
        { description: 'Starting ref (branch, tag, or SHA)', name: '--ref', valueName: '<ref>' },
        { description: 'One-line title for the Worker', name: '--title', valueName: '<text>' },
    ],
    name: 'start',
    notes: [
        'A Worker needs a Task: start one with haus task start first.',
        'Starting a Worker posts nothing. Its report posts in the Task and reaches you as an inbox item.',
    ],
    positionals: [],
    run: (args) => runWorkerStart(args, defaultDeps()),
    summary: 'Start a Worker on a Task with the brief from stdin',
    usage: 'haus worker start --task <KEY-n> --on <cursor|claude> --repo <owner/name> [--ref <ref>] --title <text>',
};

const SEND_COMMAND: SubCommand = {
    examples: [
        'printf "Address the review comments." | haus worker send --worker wkr_9f2c1a0b7d4e6f81',
    ],
    flags: [
        { description: 'The Worker to follow up', name: '--worker', valueName: '<workerId>' },
        {
            description: 'Stop the working turn and drop older queued follow-ups first',
            name: '--interrupt',
        },
    ],
    name: 'send',
    positionals: [],
    run: (args) => runWorkerSend(args, defaultDeps()),
    summary: 'Queue a follow-up from stdin as the Worker’s next turn',
    usage: 'haus worker send --worker <workerId> [--interrupt]',
};

const STOP_COMMAND: SubCommand = {
    examples: ['haus worker stop --worker wkr_9f2c1a0b7d4e6f81'],
    flags: [{ description: 'The Worker to stop', name: '--worker', valueName: '<workerId>' }],
    name: 'stop',
    positionals: [],
    run: (args) => runWorkerStop(args, defaultDeps()),
    summary: 'Stop a Worker you started: its working or queued turn, and queued follow-ups',
    usage: 'haus worker stop --worker <workerId>',
};

export const WORKER_SUBCOMMANDS: SubCommand[] = [
    START_COMMAND,
    SEND_COMMAND,
    INSPECT_COMMAND,
    STOP_COMMAND,
];

export async function runWorkerStart(args: ParsedArgs, deps: WorkerDeps) {
    const task = readTask(args);
    const repository = readRepository(args);
    const title = readTitle(args);
    const startingRef = args.values['--ref']?.trim() || null;
    const place = readPlace(args);
    const brief = await readStdin(
        deps,
        'The brief for the Worker is required on stdin.',
        START_RECIPE
    );
    const response = await deps.client
        .request('/api/agent/workers', agentWorkerStartResponseSchema, {
            body: {
                brief,
                nonce: deps.mintNonce(),
                ...(place ? { place } : {}),
                repository,
                startingRef,
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
    deps.write(
        renderWorkerStart(response, {
            repository,
            startingRef,
            task,
            target: formatTaskTarget(task),
        })
    );
    return 0;
}

export async function runWorkerSend(args: ParsedArgs, deps: WorkerDeps) {
    const workerId = requiredValue(args, '--worker');
    const interrupt = args.flags['--interrupt'] === true;
    const text = await readStdin(
        deps,
        'The follow-up for the Worker is required on stdin.',
        `printf "Address the review comments." | haus worker send --worker ${workerId}`
    );
    const receipt = await deps.client.request(
        '/api/agent/workers/send',
        agentWorkerSendReceiptResponseSchema,
        {
            body: { interrupt, nonce: deps.mintNonce(), text, workerId },
            method: 'POST',
            timeoutMs: 60_000,
        }
    );
    deps.write(renderWorkerSend(receipt, interrupt));
    return 0;
}

export async function runWorkerStop(args: ParsedArgs, deps: WorkerDeps) {
    const workerId = requiredValue(args, '--worker');
    const { worker } = await deps.client.request(
        '/api/agent/workers/stop',
        agentWorkerStopReceiptResponseSchema,
        { body: { workerId }, method: 'POST' }
    );
    deps.write(renderWorkerStop(worker));
    return 0;
}

async function readStdin(deps: WorkerDeps, message: string, nextAction: string) {
    const text = deps.stdinIsTty ? '' : await deps.readStdin();
    if (!text.trim()) {
        throw new AgentCliError('MISSING_CONTENT', message, { nextAction });
    }
    return text.trimEnd();
}

function readTask(args: ParsedArgs) {
    if (!args.values['--task']?.trim()) {
        throw taskRequired('A Worker works for a Task, and this start named none.');
    }
    return taskKeyArgument(args.values['--task'], '--task');
}

function taskRequired(message: string) {
    return new AgentCliError('WORKER_TASK_REQUIRED', message, {
        nextAction: TASK_REQUIRED_NEXT_ACTION,
    });
}

function readRepository(args: ParsedArgs) {
    const raw = requiredValue(args, '--repo');
    const parsed = workerRepositorySchema.safeParse(raw);
    if (!parsed.success) {
        throw new AgentCliError('INVALID_ARG', `Invalid repository "${raw}".`, {
            nextAction: 'Use --repo owner/name, for example --repo haus/haus.',
        });
    }
    return parsed.data;
}

function readTitle(args: ParsedArgs) {
    const raw = requiredValue(args, '--title');
    const parsed = workerTitleSchema.safeParse(raw);
    if (!parsed.success) {
        throw new AgentCliError('INVALID_ARG', 'The title must be 1 to 120 characters.', {
            nextAction: 'Give the Worker one short title a person can scan.',
        });
    }
    return parsed.data;
}

function readPlace(args: ParsedArgs) {
    const raw = args.values['--on']?.trim();
    if (!raw) {
        return null;
    }
    const parsed = workerPlaceSchema.safeParse(raw);
    if (!parsed.success) {
        throw new AgentCliError('INVALID_ARG', `Invalid Worker place "${raw}".`, {
            nextAction: 'Use --on cursor or --on claude.',
        });
    }
    return parsed.data;
}
