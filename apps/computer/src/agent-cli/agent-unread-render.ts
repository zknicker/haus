import type { z } from 'zod';
import { formatThreadFollowRestoration } from '../inbox-format.ts';
import type { AgentCliMessage, agentHistoryResponseSchema } from './agent-api-schemas.ts';
import { formatHistoryLine } from './agent-format.ts';

type AgentHistoryResponse = z.infer<typeof agentHistoryResponseSchema>;

/**
 * `haus message read --unread`: what is unread in one conversation, starting
 * right after the Agent's read position (Raft's `formatUnreadWindow`). Reading
 * moves that position, so the continuation is the same command again, never a
 * seq that can go stale.
 */
export function renderUnreadWindow(target: string, response: AgentHistoryResponse): string {
    const readThrough = response.unread_after_seq ?? response.last_read.after;
    const messages = response.messages;
    if (messages.length === 0) {
        return `No unread messages in ${target}. You have read through seq ${readThrough}.\n`;
    }
    const newPosition = response.read_through_seq;
    const movedTo =
        typeof newPosition === 'number' && newPosition > readThrough
            ? `Read position: seq ${readThrough} → ${newPosition}. To re-read these: haus message read --target "${target}" --after ${readThrough}`
            : null;
    const end = response.has_newer
        ? `More unread remain. Next: haus message read --target "${target}" --unread`
        : 'No more unread in this target.';
    const reactivated = new Set(response.thread_follow_reactivated_message_ids);
    const header = `Unread window: ${messages.length} returned, seq ${seqRange(messages)}, oldest to newest, starting after your read position (seq ${readThrough}).`;
    const lines = messages.flatMap((message) => [
        ...(reactivated.has(message.id) ? [formatThreadFollowRestoration(response.target)] : []),
        formatHistoryLine(message),
    ]);
    return `${header}\n\n${lines.join('\n')}\n\n${[movedTo, end].filter(Boolean).join('\n')}\n`;
}

function seqRange(messages: AgentCliMessage[]): string {
    const first = messages[0]?.sequence;
    const last = messages.at(-1)?.sequence;
    return first === last ? String(first) : `${first}-${last}`;
}
