import type { AgentTurnTrigger, Chat } from '@haus/api';
import { useQueries } from '@tanstack/react-query';
import { useAgentRunTrigger } from '../../../hooks/members/use-agent-run-trigger.ts';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import { queryPolicy } from '../../../lib/query-policy.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import { resolveTurnRowTitle, type TurnRowTitle } from './agent-turn-row-model.ts';

/**
 * Titles for a list of turn rows from any number of Agents. A turn's trigger
 * quotes its message, so a row is titled from the read that listed it. Only a
 * running turn the list did not name (one that started after the read) asks
 * the Server for its own trigger. The Chat list is read once for the places.
 */
export function useAgentsTurnRowTitles(
    serverId: string,
    turns: readonly { readonly agentId: string; readonly turn: AgentActivityTurn }[]
): (turn: AgentActivityTurn) => TurnRowTitle {
    const utils = hausTrpc.useUtils();
    const running = turns.filter(({ turn }) => turn.kind === 'active' && turn.trigger === null);
    const runTriggers = useQueries({
        queries: running.map(({ agentId, turn }) =>
            utils.agent.runTrigger.queryOptions(
                { agentId, runId: turn.runId, serverId },
                { ...queryPolicy.syncedSnapshot, enabled: Boolean(serverId) }
            )
        ),
    });
    const runTriggerOf = new Map(
        running.map(({ turn }, index) => {
            const query = runTriggers[index];
            // A failed read leaves the row untitled rather than pending forever.
            const trigger = query?.data ? query.data.trigger : query?.isError ? null : undefined;
            return [turn.runId, trigger] as const;
        })
    );
    const titleOf = useTriggerTitles(serverId);
    return (turn) =>
        titleOf(
            turn.trigger ?? (runTriggerOf.has(turn.runId) ? runTriggerOf.get(turn.runId) : null)
        );
}

/** One Agent's turn titles: {@link useAgentsTurnRowTitles} with a single Agent. */
export function useTurnRowTitles(
    serverId: string,
    agentId: string,
    turns: readonly AgentActivityTurn[]
): (turn: AgentActivityTurn) => TurnRowTitle {
    return useAgentsTurnRowTitles(
        serverId,
        turns.map((turn) => ({ agentId, turn }))
    );
}

/** The title of one run that is still working, for the hover card's live line. */
export function useRunTitle(serverId: string, agentId: string, runId: string): TurnRowTitle {
    const trigger = useAgentRunTrigger(serverId, agentId, runId);
    return useTriggerTitles(serverId)(trigger);
}

/** `undefined` is a trigger still being read: the title holds blank, never the outcome. */
function useTriggerTitles(
    serverId: string
): (trigger: AgentTurnTrigger | null | undefined) => TurnRowTitle {
    const chats = useChats(serverId);
    const chatsById = new Map<string, Pick<Chat, 'kind' | 'name'>>(
        (chats.data ?? []).map((chat) => [chat.id, chat])
    );
    return (trigger) =>
        trigger === undefined
            ? { kind: 'pending', place: null }
            : resolveTurnRowTitle(trigger, chatsById);
}
