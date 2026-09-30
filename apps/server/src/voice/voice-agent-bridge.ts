import { emitDurableChatEvent } from '../chats/durable-events.ts';
import { sendChatMessage } from '../chats/send-message.ts';
import { VoiceDelegations } from './live-events.ts';
import type { VoiceCallOptions } from './voice-call.ts';
import { readVoiceActivity, readVoiceMessages, readVoiceTarget } from './voice-context.ts';

export type VoiceContextAppend = (
    type: 'session.thinking.append' | 'session.commentary.append',
    content: string,
    id?: string | null
) => void;

export async function createVoiceAgentBridge(
    options: VoiceCallOptions,
    append: VoiceContextAppend,
    isActive: () => boolean
) {
    const { db, member, scope, target } = options;
    const history = await readVoiceMessages(db, scope);
    const initialActivity = await readVoiceActivity(db, scope, target);
    const delegations = new VoiceDelegations();
    let sequence = history.at(-1)?.sequence ?? 0;
    let lastActivity = initialActivity;

    async function dispatch() {
        const request = delegations.take(Date.now());
        if (!(request && isActive())) {
            return;
        }
        const result = await sendChatMessage(
            db,
            member,
            {
                ...scope,
                content: request.text,
                nonce: `voice:${request.id}`,
                attachmentIds: [],
            },
            options.delivery
        );
        for (const event of result.events) {
            emitDurableChatEvent({ audienceUserId: null, event });
        }
        void options.postCommitWork.wakeAgents(options.delivery, result.wakes);
        append(
            'session.thinking.append',
            'The spoken request was saved in the DM for the existing Agent. Await its reply; do not claim completion.',
            request.id
        );
    }

    return {
        history,
        initialActivity,
        delegations,
        async synchronize() {
            const current = await readVoiceTarget(db, member, scope);
            if (!isActive()) {
                return;
            }
            if (current.generation !== target.generation || current.agentId !== target.agentId) {
                throw new Error('The Agent session changed.');
            }
            await dispatch();
            const messages = await readVoiceMessages(db, scope, sequence);
            if (!isActive()) {
                return;
            }
            for (const message of messages) {
                if (message.agentId === target.agentId) {
                    append('session.commentary.append', message.content);
                } else {
                    append(
                        'session.thinking.append',
                        `A human message in the DM: ${message.content}`
                    );
                }
                sequence = message.sequence;
            }
            const activity = await readVoiceActivity(db, scope, current);
            if (activity !== lastActivity && isActive()) {
                append('session.thinking.append', activity);
                lastActivity = activity;
            }
        },
    };
}
