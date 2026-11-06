import { type CloudAgentObservation, cloudAgentStallAttentionId } from '@haus/api';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable } from '../postgres/schema.ts';
import { linkParentChatsTable } from './cloud-agent-work-visibility.ts';

/**
 * Computer tries this once a follow-up's send keeps failing past its own
 * grace period: ask the provider to clear whatever holds the session busy
 * (`send --interrupt`'s own mechanism), then retry the send right away. A
 * follow-up still queued and retrying carries this errorCode when even that
 * didn't deliver it — never on its own a reason to settle. One inbox
 * attention still wakes the delegating Agent, so it is never silent, but
 * sparse reminders replace a terminal failure: Computer reports the same
 * errorCode on every retry tick, and this dedupes every report inside one
 * window to the same attention, then opens a fresh one each time a new
 * window starts. There is no shared enum for the string: the Computer side
 * and the website status line each compare this literal, the same way
 * `cloud-agent-presentation.ts` already compares raw `launch-` and
 * `provider-launch-` prefixes without one.
 */
export const followUpAutoInterruptFailedErrorCode = 'followup-auto-interrupt-failed';
/**
 * Claude's own session log can grow past what a bounded backward scan for
 * this Run's prompt will read through. Rather than read that as `queued`
 * forever with no sign anything was cut off, Computer reports this errorCode
 * on a non-terminal Run so it still gets an attention, the same way a stuck
 * follow-up does (TECH-7).
 */
export const claudePromptNotFoundErrorCode = 'claude-prompt-not-found';
const nonTerminalAttentionErrorCodes: ReadonlySet<string> = new Set([
    followUpAutoInterruptFailedErrorCode,
    claudePromptNotFoundErrorCode,
]);
/** How often a non-terminal Run still stuck after that gets another reminder. */
const stallReminderMs = 2 * 60 * 60_000;

/** Whether a non-settling observation's errorCode still earns an attention. */
export function isStalledErrorCode(errorCode: string | null | undefined): boolean {
    return errorCode != null && nonTerminalAttentionErrorCodes.has(errorCode);
}

/**
 * A settling Run gets exactly one attention, keyed by its own id. A stall
 * repeats on every retry tick, so its key buckets by wall-clock window
 * instead: the same bucket collapses to the same attention, and the next
 * bucket opens a fresh one.
 */
export function attentionDedupeKey(
    observation: CloudAgentObservation,
    stalled: boolean,
    observedAt: Date
): string {
    if (!stalled) {
        return observation.runId;
    }
    return cloudAgentStallAttentionId(
        observation.runId,
        Math.floor(observedAt.getTime() / stallReminderMs)
    );
}

/** A Chat that still exists and is not tombstoned, nor is its parent. */
export async function isLiveChat(
    db: HausDatabase,
    input: { chatId: string; serverId: string }
): Promise<boolean> {
    const [chat] = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .leftJoin(
            linkParentChatsTable,
            and(
                eq(linkParentChatsTable.serverId, chatsTable.serverId),
                eq(linkParentChatsTable.id, chatsTable.parentChatId)
            )
        )
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                eq(chatsTable.id, input.chatId),
                isNull(chatsTable.deletedAt),
                or(
                    isNull(chatsTable.parentChatId),
                    and(isNotNull(linkParentChatsTable.id), isNull(linkParentChatsTable.deletedAt))
                )
            )
        )
        .limit(1);
    return chat !== undefined;
}
