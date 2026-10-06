import type { Chat } from '@haus/api';
import { useTurnTriggerMessages } from '../../../hooks/members/use-turn-trigger-messages.ts';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import { resolveTurnRowTitle, type TurnRowTitle } from './agent-turn-row-model.ts';

/**
 * Titles for a list of turn rows, keyed by run id. The trigger messages and
 * the Chat list are each read once for the whole list, never per row.
 */
export function useTurnRowTitles(
    serverId: string,
    turns: readonly AgentActivityTurn[]
): (turn: AgentActivityTurn) => TurnRowTitle {
    const messages = useTurnTriggerMessages(
        serverId,
        turns.map((turn) => turn.trigger)
    );
    const chats = useChats(serverId);
    const chatsById = new Map<string, Pick<Chat, 'kind' | 'name'>>(
        (chats.data ?? []).map((chat) => [chat.id, chat])
    );
    return (turn) => resolveTurnRowTitle(turn.trigger, messages, chatsById);
}
