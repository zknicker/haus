import EventEmitter, { on } from 'node:events';
import {
    type AgentLifecycleEvent,
    type ChatEngagementEndReason,
    type ChatEngagementEvent,
    chatEngagementEventSchema,
} from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { readActiveRunEngagements, readSettledRunEngagements } from './chat-engagement.ts';
import { onAgentLifecycle } from './lifecycle.ts';

const eventName = 'chat.engagement';
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

/** Chats each live run has been announced as engaging, so a repeat read stays quiet. */
const announced = new Map<string, Set<string>>();
/** Runs whose settlement was observed; a late start announcement for one is dropped. */
const settledRuns = new Set<string>();
const settledRunMemory = 1000;

interface RunIdentity {
    agentId: string;
    runId: string;
    serverId: string;
}

/**
 * Announces every Chat the run newly engages. Called after a write that gave
 * the run exact visibility commits: a composed receipt, a pull, or a held send.
 */
export async function announceRunEngagements(db: HausDatabase, run: RunIdentity) {
    if (settledRuns.has(run.runId)) {
        return;
    }
    const engagements = await readActiveRunEngagements(db, run);
    // Settlement can be observed while the read is in flight.
    if (settledRuns.has(run.runId)) {
        return;
    }
    const chats = announced.get(run.runId) ?? new Set<string>();
    announced.set(run.runId, chats);
    for (const engagement of engagements) {
        if (chats.has(engagement.chatId)) {
            continue;
        }
        chats.add(engagement.chatId);
        publish({
            agentId: run.agentId,
            chatId: engagement.chatId,
            runId: run.runId,
            serverId: run.serverId,
            type: 'chat.engagement.started',
        });
    }
}

/**
 * Ends engagement from the lifecycle facts that close it: an Agent message
 * committed into a Chat (`sending`) ends that Chat at once, and terminal turn
 * proof (`settled`) ends every Chat the run engaged.
 */
export function installChatEngagementProjector(
    db: HausDatabase,
    postCommitWork: Pick<ServerPostCommitWork, 'run'>
) {
    return onAgentLifecycle((event) => {
        if (event.phase === 'sending') {
            // A run this process never announced (a restarted Server) may still
            // be engaged in a reader's recovered snapshot, so it ends anyway.
            const chats = announced.get(event.runId);
            if (!chats || chats.delete(event.chatId)) {
                publishEnded(event, event.chatId, 'sent');
            }
            return;
        }
        if (event.phase !== 'settled') {
            return;
        }
        rememberSettled(event.runId);
        const chats = announced.get(event.runId) ?? new Set<string>();
        announced.delete(event.runId);
        const reason = event.outcome === 'completed' ? 'settled' : 'interrupted';
        void postCommitWork.run('chat.engagement.settle', async () => {
            // A restarted Server announced nothing, so durable visibility is read too.
            for (const engagement of await readSettledRunEngagements(db, event)) {
                chats.add(engagement.chatId);
            }
            for (const chatId of chats) {
                publishEnded(event, chatId, reason);
            }
        });
    });
}

export async function* subscribeToChatEngagements(signal?: AbortSignal) {
    const iterator = signal ? on(emitter, eventName, { signal }) : on(emitter, eventName);
    for await (const [event] of iterator) {
        yield chatEngagementEventSchema.parse(event);
    }
}

function publishEnded(event: AgentLifecycleEvent, chatId: string, reason: ChatEngagementEndReason) {
    publish({
        agentId: event.agentId,
        chatId,
        reason,
        runId: event.runId,
        serverId: event.serverId,
        type: 'chat.engagement.ended',
    });
}

type EventInput = ChatEngagementEvent extends infer Event
    ? Event extends unknown
        ? Omit<Event, 'emittedAt'>
        : never
    : never;

function publish(input: EventInput) {
    emitter.emit(
        eventName,
        chatEngagementEventSchema.parse({ ...input, emittedAt: new Date().toISOString() })
    );
}

function rememberSettled(runId: string) {
    settledRuns.add(runId);
    if (settledRuns.size > settledRunMemory) {
        const oldest = settledRuns.values().next().value;
        if (oldest !== undefined) {
            settledRuns.delete(oldest);
        }
    }
}
