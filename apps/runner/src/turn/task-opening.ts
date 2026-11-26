import { composeTaskCheckout, composeTaskReplay, taskCheckoutCommand } from '@haus/agent-prompt';
import { type AgentStartCommand, type RunnerSessionPolicy, taskReplaySchema } from '@haus/api';
import type { RunAuthority, RunTools } from '../run-context.ts';
import { agentGet } from './agent-drive.ts';

export interface TaskOpeningInput {
    readonly authority: RunAuthority;
    readonly log: (line: string) => void;
    readonly policy: RunnerSessionPolicy | null;
    readonly signal: AbortSignal;
    readonly start: AgentStartCommand;
    readonly tools: RunTools;
}

export async function composeTaskOpening(input: TaskOpeningInput) {
    const task = input.policy?.kind === 'task' ? input.policy.task : null;
    if (!task) {
        return null;
    }
    const checkout = task.repo ? await checkOut(input, task.repo) : null;
    const replay = await readReplay(input);
    const opening = [checkout, replay].filter((part) => part !== null).join('\n\n');
    return opening || null;
}

async function checkOut(input: TaskOpeningInput, repo: { name: string; ref: string | null }) {
    const outcome = await input.tools.bash(
        'task-checkout',
        { command: taskCheckoutCommand({ ref: repo.ref, repo: repo.name }) },
        input.signal
    );
    return composeTaskCheckout({
        failed: outcome.isError,
        output: outcome.content
            .flatMap((part) => (part.type === 'text' ? [part.text] : []))
            .join('\n'),
        ref: repo.ref,
        repo: repo.name,
    });
}

async function readReplay(input: TaskOpeningInput) {
    const sequences = input.start.inbox.map((item) => item.sequence).filter((seq) => seq > 0);
    const query = sequences.length > 0 ? `?before=${Math.min(...sequences)}` : '';
    try {
        const replay = taskReplaySchema.parse(
            await agentGet(input.authority, `/api/agent/tasks/replay${query}`, 'the Task chat')
        );
        return composeTaskReplay(replay);
    } catch (error) {
        input.log(`Runner could not reread ${input.start.agentId}'s Task chat: ${String(error)}`);
        return null;
    }
}
