import type { Agent } from '@haus/api';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { useOptionalCurrentAgentActivity } from '../../../hooks/agents/use-current-agent-activity.tsx';
import { useOpenAgentProfile } from '../../../hooks/agents/use-open-agent-profile.ts';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useUsage } from '../../../hooks/servers/use-usage.ts';
import { summarizeAgentTokenUsage } from '../../stats/agent-usage-summary.ts';
import { useAgentLifecycle } from '../agent-lifecycle.tsx';
import { useServerContext } from '../server-context.ts';
import { serverChatRoute } from '../server-routes.ts';
import {
    type ActiveAgent,
    activeAgentHistoryDays,
    rankActiveAgents,
    toActiveAgent,
} from './active-agents.ts';
import { currentAgentActivityLabels } from './inbox-agent-activity.ts';

/**
 * Every Agent that moved this week, ranked for the Agents meter, or null until
 * the usage read settles.
 *
 * The week comes off the Server's own usage snapshot — one read for the whole
 * Server, sliced per Agent by the same summarizer the Agent profile's usage
 * tile uses. Ranking is a question about every Agent at once, so a per-Agent
 * read was never the right shape for it.
 *
 * Null rather than a partial list: a list ranked against a half-loaded window
 * would reorder under the reader, so the meter stays blank until it is honest.
 */
export function useActiveAgentRows(): ActiveAgent[] | null {
    const { server } = useServerContext();
    const agents = useAgents(server.id);
    const usage = useUsage(server.id);
    const currentActivity = useOptionalCurrentAgentActivity();
    const lifecycles = useAgentLifecycle();
    // Usage days are UTC days, so the only tick that can move this window is a
    // midnight crossing. The minute clock is what notices one; keying the
    // summaries on the day itself keeps a 90-day breakdown from being re-sliced
    // per Agent every minute.
    const today = new Date(useRelativeNow(60_000)).toISOString().slice(0, 10);
    const activities = currentActivity?.activities ?? [];
    const labels = React.useMemo(
        () => currentAgentActivityLabels(activities, lifecycles),
        [activities, lifecycles]
    );
    const tokenUsage = usage.data?.tokenUsage;
    const weeks = React.useMemo(() => {
        if (!(agents.data && tokenUsage)) {
            return null;
        }
        const asOf = new Date(`${today}T00:00:00.000Z`);
        return agents.data.map((agent) => ({
            agent,
            usage: summarizeAgentTokenUsage(tokenUsage, agent.id, activeAgentHistoryDays, asOf),
        }));
    }, [agents.data, today, tokenUsage]);

    return React.useMemo(
        () =>
            weeks === null
                ? null
                : rankActiveAgents(
                      weeks.map((week) =>
                          toActiveAgent(week.agent, week.usage, labels.get(week.agent.id) ?? null)
                      )
                  ),
        [labels, weeks]
    );
}

/**
 * Opening an Agent's row: its DM, because the thing a person wants from an
 * Agent they just looked at is to talk to it; an Agent with no DM yet falls
 * back to its profile.
 */
export function useOpenActiveAgent(): (agent: Agent) => void {
    const { server } = useServerContext();
    const navigate = useNavigate();
    const openAgentProfile = useOpenAgentProfile();
    return (agent) => {
        if (agent.dmChatId) {
            navigate(serverChatRoute(server.slug, agent.dmChatId));
            return;
        }
        openAgentProfile(agent.id);
    };
}
