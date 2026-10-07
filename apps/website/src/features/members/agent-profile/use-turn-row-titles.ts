import type { AgentTurnTrigger, Chat } from '@haus/api';
import { useQueries } from '@tanstack/react-query';
import { useAgentRunTrigger } from '../../../hooks/members/use-agent-run-trigger.ts';
import { useTurnTriggerMessages } from '../../../hooks/members/use-turn-trigger-messages.ts';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import { queryPolicy } from '../../../lib/query-policy.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import { resolveTurnRowTitle, type TurnRowTitle } from './agent-turn-row-model.ts';

/**
 * Titles for a list of turn rows from any number of Agents. A settled turn
 * carries its trigger; a running turn (at most one per Agent) reads its own
 * from the Server, since it has not settled yet. Trigger messages and the
 * Chat list are each read once for the whole list.
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
    const triggerOf = (turn: AgentActivityTurn) =>
        turn.trigger ?? (runTriggerOf.has(turn.runId) ? runTriggerOf.get(turn.runId) : null);
    const titleOf = useTriggerTitles(
        serverId,
        turns.map(({ turn }) => triggerOf(turn))
    );
    return (turn) => titleOf(triggerOf(turn));
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
