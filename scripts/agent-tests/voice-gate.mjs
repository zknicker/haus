// The shared voice gate every scenario passes after its own assertions: each
// message the model authored in the scenario's channels is checked against the
// house voice (agent-voice.mjs). It reads collaboration state the run already
// produced; it never adds a turn.

import { checkAgentVoice, describeViolation } from './agent-voice.mjs';

/** Nonce prefix of messages the harness itself authored, including seeded Agent posts. */
const harnessNoncePrefixes = ['agenttests_', 'agent-tests_'];
const seededRunPrefix = 'run_agenttests_';

/**
 * Voice violations across `messages`, keyed to the model-authored message.
 * Every harness-authored text (human sends, seeded Agent posts) counts as a
 * quote source, so the Agent repeating it is not held against its voice.
 */
export function agentVoiceViolations(messages) {
    const quotedSources = messages
        .filter((message) => !isModelAuthored(message))
        .map((message) => message.content ?? '');
    return messages.filter(isModelAuthored).flatMap((message) =>
        checkAgentVoice(message.content ?? '', { quotedSources }).map((violation) => ({
            ...violation,
            messageId: message.id,
        }))
    );
}

/** Records one `agent voice` gate on the scenario's assertion list. */
export function expectAgentVoice(expect, messages) {
    const violations = agentVoiceViolations(messages).map(
        (violation) => `${violation.messageId} ${describeViolation(violation)}`
    );
    // The count makes a gate that inspected nothing visible in the run summary.
    const inspected = messages.filter(isModelAuthored).length;
    expect(violations, `agent voice (${inspected} model messages)`).toHaveLength(0);
}

/**
 * Top-level messages in the scenario's channels, the conversation surface the
 * house voice governs. DMs and Threads (task work, drafted deliverables) are out
 * of scope. Channels are the tracked chats with a name. Read-only: the gate
 * never claims chats for cleanup.
 */
export async function collectScenarioMessages(kit) {
    const messages = [];
    const channels = kit.transcript().chats.filter((chat) => chat.name !== null);
    for (const { id: chatId } of channels) {
        let beforeSequence;
        do {
            const page = await kit.trpc('chat.messages', {
                chatId,
                limit: 100,
                serverId: kit.serverId,
                ...(beforeSequence ? { beforeSequence } : {}),
            });
            messages.push(...page.messages);
            beforeSequence = page.nextBeforeSequence;
        } while (beforeSequence);
    }
    return messages;
}

/**
 * Model output is an Agent message sent from a real turn: it carries a runId.
 * Seeded posts mint `run_agenttests_*` runners and harness nonces; runless
 * Agent messages are Server-authored, not the model's voice.
 */
function isModelAuthored(message) {
    if (message.author?.kind !== 'agent' || !message.runId) {
        return false;
    }
    const nonce = message.nonce ?? '';
    return !(
        message.runId.startsWith(seededRunPrefix) ||
        harnessNoncePrefixes.some((prefix) => nonce.startsWith(prefix))
    );
}
