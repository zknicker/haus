import type { Agent } from '@haus/api';
import { KPI } from '@heroui-pro/react/kpi';
import { ArrowUpRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useUsage } from '../../hooks/servers/use-usage.ts';
import type { ServerDetail } from '../../lib/haus-server.tsx';
import { usageRoute } from '../servers/server-routes.ts';
import { agentUsageSparkline, summarizeAgentTokenUsage } from '../stats/agent-usage-summary.ts';

const tileDays = 30;
const sparklineHeight = 64;

/**
 * One Agent's token volume on its profile: the 30-day number and its daily
 * shape, then the way through to the dashboard that can slice it.
 *
 * The profile used to carry the whole Usage view — range picker, stacked chart,
 * and a per-configuration grid — which made a summary page host a second
 * dashboard. Comparison, ranges, and per-configuration detail belong to Usage,
 * scoped to this Agent by the link below.
 */
export function AgentUsageTile({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const usage = useUsage(server.id);
    const tokenUsage = usage.data?.tokenUsage;
    const summary = useMemo(
        () => (tokenUsage ? summarizeAgentTokenUsage(tokenUsage, agent.id, tileDays) : null),
        [agent.id, tokenUsage]
    );

    const hasUsage = summary !== null && summary.totalTokens > 0;

    return (
        <KPI>
            <KPI.Header>
                <KPI.Title>Processed tokens</KPI.Title>
            </KPI.Header>
            {/* Two equal columns put the sparkline beside the number rather than
                under it, per KPI's own inline-chart recipe. Without a series to
                draw, the number keeps the whole content row. */}
            <KPI.Content className={hasUsage ? 'grid-cols-2 items-end' : undefined}>
                {summary ? (
                    <>
                        <div className="flex flex-col gap-1">
                            <KPI.Value
                                maximumFractionDigits={1}
                                notation="compact"
                                value={summary.totalTokens}
                            />
                            <span className="text-muted text-sm">
                                {hasUsage
                                    ? `Last ${summary.days} days`
                                    : `No model turns in the last ${summary.days} days`}
                            </span>
                        </div>
                        {hasUsage ? (
                            <KPI.Chart
                                color="var(--color-accent)"
                                data={agentUsageSparkline(summary)}
                                dataKey="tokens"
                                height={sparklineHeight}
                                strokeWidth={1.5}
                            />
                        ) : null}
                    </>
                ) : usage.error ? (
                    <p className="text-danger text-sm" role="alert">
                        {usage.error.message}
                    </p>
                ) : (
                    <div aria-busy="true" className="min-h-16">
                        <span className="sr-only">Loading processed tokens</span>
                    </div>
                )}
            </KPI.Content>
            <KPI.Separator />
            <KPI.Footer>
                <Link
                    className="inline-flex w-fit items-center gap-1 font-semibold text-accent text-sm"
                    to={usageRoute(server.slug, { agentId: agent.id })}
                >
                    See in Usage
                    <Icon aria-hidden="true" icon={ArrowUpRight01Icon} size={12} />
                </Link>
            </KPI.Footer>
        </KPI>
    );
}
