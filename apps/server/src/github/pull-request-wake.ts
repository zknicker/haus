import type { PullRequestReading } from '@haus/api';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { isLiveChat } from '../chats/link-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { type PullRequestTransition, pullRequestChangeKey } from './pull-request-change.ts';
import { readPullRequestTaskWakes } from './pull-request-task-wakes.ts';

interface ReadingState {
    checks: PullRequestReading['checks'];
    state: PullRequestReading['state'];
}

export interface PullRequestWakeReading {
    headSha: string;
    number: number;
    repository: string;
    serverId: string;
    url: string;
}

interface AgentWake {
    agentId: string;
    serverId: string;
}

export function pullRequestTransitions(
    before: ReadingState,
    after: ReadingState
): PullRequestTransition[] {
    const transitions: PullRequestTransition[] = [];
    if (before.state === 'draft' && after.state === 'open') {
        transitions.push('ready_for_review');
    }
    if (before.checks === 'pending' && after.checks === 'passing') {
        transitions.push('checks_passing');
    }
    if (before.checks === 'pending' && after.checks === 'failing') {
        transitions.push('checks_failing');
    }
    return transitions;
}

export async function enqueuePullRequestWakes(
    tx: HausDatabase,
    delivery: Pick<AgentDelivery, 'enqueue'>,
    input: { reading: PullRequestWakeReading; transitions: readonly PullRequestTransition[] }
): Promise<AgentWake[]> {
    const { reading } = input;
    if (input.transitions.length === 0) {
        return [];
    }
    const wakes = new Map<string, AgentWake>();
    for (const task of await readPullRequestTaskWakes(tx, reading)) {
        if (!(await isLiveChat(tx, { chatId: task.chatId, serverId: reading.serverId }))) {
            continue;
        }
        for (const transition of input.transitions) {
            await delivery.enqueue(tx, {
                agentId: task.agentId,
                chatId: task.chatId,
                content: describeTransition(reading, transition),
                dedupeKey: pullRequestChangeKey(reading, transition),
                serverId: reading.serverId,
                source: 'pull_request',
            });
        }
        wakes.set(task.agentId, { agentId: task.agentId, serverId: reading.serverId });
    }
    return [...wakes.values()];
}

function describeTransition(reading: PullRequestWakeReading, transition: PullRequestTransition) {
    const pull = `${reading.repository}#${reading.number}`;
    const head = reading.headSha.slice(0, 7);
    if (transition === 'ready_for_review') {
        return `Pull request ${pull} is ready for review (head ${head}).`;
    }
    const verdict = transition === 'checks_passing' ? 'passed' : 'failed';
    return `Checks ${verdict} on pull request ${pull} (head ${head}).`;
}
