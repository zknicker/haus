import { readFile } from 'node:fs/promises';
import { composeTurnPrompt } from './turn-prompt.ts';

export async function streamWeeklyTurn({ agent, session, turn, notes, persistEvidence, prompt }) {
    const result = await agent.stream({
        prompt,
        session,
        abortSignal: AbortSignal.timeout(180_000),
    });
    let finished = false;
    for await (const part of result.fullStream) {
        const failure = nativeStreamFailure(part);
        if (failure) {
            turn.failure = failure;
            await persistEvidence();
            throw new Error(turn.failure);
        }
        if (part.type === 'finish') {
            turn.finishReason = part.finishReason;
            const reason =
                typeof part.finishReason === 'string'
                    ? part.finishReason
                    : part.finishReason?.unified;
            if (reason === 'error') {
                throw new Error('Native model finished with an error');
            }
            finished = true;
        }
        if (part.type === 'tool-call') {
            turn.toolCount = (turn.toolCount ?? 0) + 1;
        }
    }
    if (!finished) {
        throw new Error('Native model stream ended without a finish receipt');
    }
    turn.finalText = await result.text;
    turn.notesAfter = await readFile(notes, 'utf8').catch(() => null);
    turn.messages = turn.actions
        .filter((a) => a.path === '/api/agent/messages/send' && a.result?.state === 'sent')
        .map((a) => a.result.message.content);
    await persistEvidence();
    process.stdout.write(
        `Cove weekly: ${turn.label}; ${turn.toolCount ?? 0} tool calls; ${turn.messages.length} delivered messages\n`
    );
    return turn;
}

export function composeWeeklyTurn({ fixture, root, inbox, runId, frame, agentId }) {
    return composeTurnPrompt(
        {
            agentId,
            dataRoot: root,
            drainItemIds: inbox.map((item) => item.id),
            homeTimezone: 'America/New_York',
            inbox,
            inboxDelivery: 'concrete',
            runId,
            serverId: fixture.serverId,
            totalPending: inbox.length,
            unreadElsewhere: [],
            warmDrainItemIds: [],
            ...frame,
        },
        { isColdStart: false, sessionGeneration: 1 }
    ).turnContent;
}

function nativeStreamFailure(part) {
    if (part.type === 'abort') {
        return 'Native turn aborted';
    }
    if (part.type === 'error') {
        return String(part.error ?? 'Native model stream failed');
    }
    return null;
}
