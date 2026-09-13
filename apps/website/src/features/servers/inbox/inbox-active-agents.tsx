import { AnimatePresence, LayoutGroup } from 'framer-motion';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { useOptionalCurrentAgentActivity } from '../../../hooks/agents/use-current-agent-activity.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useUsage } from '../../../hooks/servers/use-usage.ts';
import { summarizeAgentTokenUsage } from '../../stats/agent-usage-summary.ts';
import { useAgentLifecycle } from '../agent-lifecycle.tsx';
import { useServerContext } from '../server-context.ts';
import { agentProfileRoute, serverChatRoute } from '../server-routes.ts';
import { activeAgentWindowDays, rankActiveAgents, toActiveAgent } from './active-agents.ts';
import { AgentWeekCard } from './agent-week-card.tsx';
import { AgentWeekStrip } from './agent-week-strip.tsx';
import { currentAgentActivityLabels } from './inbox-agent-activity.ts';
import { InboxSection } from './inbox-section.tsx';
import { InboxEmptySlot, InboxMotionItem } from './inbox-section-rows.tsx';

/**
 * The Agents worth looking at right now, as a scrolling row of week cards.
 *
 * This is deliberately not a roster. A Server can hold thirty-five Agents, and
 * a card for every one of them is a wall to scan rather than a thing to read;
 * the strip carries the handful that actually moved this week, busiest and
 * live-est first. The full directory is the sidebar's job.
 *
 * The week comes off the Server's own usage snapshot — one read for the whole
 * Server, sliced per Agent by the same summarizer the Agent profile's usage
 * tile uses. Ranking a strip is a question about every Agent at once, so a
 * per-Agent read was never the right shape for it.
 *
 * The strip is the page's only section whose body is not a box: cards already
 * carry their own edges, and wrapping them would put a border around borders.
 * A still week keeps that: the slot rides the same track the cards do, bare,
 * so the empty week is the same frameless shape as the filled one and says in
 * the same quiet line the other three use that nothing moved — not that the
 * section failed to render.
 *
 * Cards and slot are children of one presence, above the empty/filled fork, so
 * the last card leaving still has something to exit into. Nesting the presence
 * inside the filled branch unmounted the whole tree the moment that branch
 * flipped, and an unmounted presence animates nothing.
 */
export function InboxActiveAgents() {
    const { server } = useServerContext();
    const navigate = useNavigate();
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
    // Null until the usage read settles: a blank strip is honest, while a strip
    // ranked against a half-loaded window would reorder under the reader.
    const weeks = React.useMemo(() => {
        if (!(agents.data && tokenUsage)) {
            return null;
        }
        const asOf = new Date(`${today}T00:00:00.000Z`);
        return agents.data.map((agent) => ({
            agent,
            usage: summarizeAgentTokenUsage(tokenUsage, agent.id, activeAgentWindowDays, asOf),
        }));
    }, [agents.data, today, tokenUsage]);
    const rows = React.useMemo(
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

    return (
        <InboxSection title="Active this week">
            {rows === null ? null : (
                <AgentWeekStrip>
                    <LayoutGroup id="inbox-active-agents">
                        <AnimatePresence initial={false} mode="popLayout">
                            {rows.length === 0 ? (
                                <InboxEmptySlot
                                    className="w-full p-1.5"
                                    key="inbox-active-agents-empty"
                                    label="No activity this week."
                                />
                            ) : (
                                rows.map((row) => (
                                    <InboxMotionItem className="shrink-0" key={row.agent.id}>
                                        <AgentWeekCard
                                            activity={row}
                                            onPress={() =>
                                                navigate(
                                                    row.agent.dmChatId
                                                        ? serverChatRoute(
                                                              server.slug,
                                                              row.agent.dmChatId
                                                          )
                                                        : agentProfileRoute(
                                                              server.slug,
                                                              row.agent.id
                                                          )
                                                )
                                            }
                                        />
                                    </InboxMotionItem>
                                ))
                            )}
                        </AnimatePresence>
                    </LayoutGroup>
                </AgentWeekStrip>
            )}
        </InboxSection>
    );
}
