import type { AgentTurnTrigger, Chat } from '@haus/api';
import { useAgentRunTrigger } from '../../../hooks/members/use-agent-run-trigger.ts';
import { useTurnTriggerMessages } from '../../../hooks/members/use-turn-trigger-messages.ts';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import { resolveTurnRowTitle, type TurnRowTitle } from './agent-turn-row-model.ts';

/**
 * Titles for a list of turn rows. A settled turn carries its trigger; the one
 * running turn reads its own from the Server, since it has not settled yet.
 * Trigger messages and the Chat list are each read once for the whole list.
 */
export function useTurnRowTitles(
    serverId: string,
    agentId: string,
    turns: readonly AgentActivityTurn[]
): (turn: AgentActivityTurn) => TurnRowTitle {
    const running = turns.find((turn) => turn.kind === 'active' && turn.trigger === null);
    const runTrigger = useAgentRunTrigger(serverId, agentId, running?.runId ?? null);
    const triggerOf = (turn: AgentActivityTurn) =>
        turn.trigger ?? (turn.runId === running?.runId ? runTrigger : null);
    const titleOf = useTriggerTitles(serverId, turns.map(triggerOf));
    return (turn) => titleOf(triggerOf(turn));
}

/** The title of one run that is still working, for the hover card's live line. */
export function useRunTitle(serverId: string, agentId: string, runId: string): TurnRowTitle {
    const trigger = useAgentRunTrigger(serverId, agentId, runId);
    return useTriggerTitles(serverId, [trigger])(trigger);
}

/** `undefined` is a trigger still being read: the title holds blank, never the outcome. */
function useTriggerTitles(
    serverId: string,
    triggers: readonly (AgentTurnTrigger | null | undefined)[]
): (trigger: AgentTurnTrigger | null | undefined) => TurnRowTitle {
    const messages = useTurnTriggerMessages(
        serverId,
        triggers.map((trigger) => trigger ?? null)
    );
    const chats = useChats(serverId);
    const chatsById = new Map<string, Pick<Chat, 'kind' | 'name'>>(
        (chats.data ?? []).map((chat) => [chat.id, chat])
    );
    return (trigger) =>
        trigger === undefined
            ? { kind: 'pending', place: null }
            : resolveTurnRowTitle(trigger, messages, chatsById);
}
