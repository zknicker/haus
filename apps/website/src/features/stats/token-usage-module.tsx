import { Tabs } from '@heroui/react';
import type { ReactNode } from 'react';
import { TokenConfigurationGrid } from './token-configuration-grid.tsx';
import { TokenTotalKpis } from './token-total-kpis.tsx';
import { TokenUsageChart } from './token-usage-chart.tsx';
import type { TokenUsageRange, TokenUsageView } from './token-usage-view.ts';

const ranges: TokenUsageRange[] = [7, 30, 90];

/**
 * The dashboard body, general to specific: filters, range totals, the daily
 * trend, then the per-configuration breakdown as its own titled section.
 * Controls, totals, and chart share the tight grid-card gap so they read as
 * one cluster rather than equally spaced islands. A fragment, so the hosting
 * column's own rhythm separates cluster from breakdown.
 *
 * The filters sit on the cluster, not in the shell band: the band's 3rem
 * chrome fits compact actions, and Select has no compact size, so a
 * field-height control up there crowds the window edge instead of aligning
 * with the cards it filters.
 */
export function TokenUsageDashboard({
    controls,
    view,
}: {
    controls?: ReactNode;
    view: TokenUsageView;
}) {
    return (
        <>
            <div className="grid gap-3">
                {controls ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        {controls}
                    </div>
                ) : null}
                <TokenUsageCluster view={view} />
            </div>
            <TokenConfigurationGrid rows={view.configurations} />
        </>
    );
}

function TokenUsageCluster({ view }: { view: TokenUsageView }) {
    return (
        <div className="grid gap-3">
            <TokenTotalKpis totals={view.totals} />
            <TokenUsageChart view={view} />
        </div>
    );
}

export function TokenUsageRangePicker({
    days,
    onChange,
}: {
    days: TokenUsageRange;
    onChange: (days: TokenUsageRange) => void;
}) {
    return (
        <Tabs
            onSelectionChange={(key) => {
                const selected = ranges.find((range) => String(range) === String(key));
                if (selected) {
                    onChange(selected);
                }
            }}
            selectedKey={String(days)}
        >
            <Tabs.ListContainer>
                <Tabs.List aria-label="Token usage range">
                    {ranges.map((range) => (
                        <Tabs.Tab aria-label={`${range} days`} id={String(range)} key={range}>
                            {range}d
                            <Tabs.Indicator />
                        </Tabs.Tab>
                    ))}
                </Tabs.List>
            </Tabs.ListContainer>
        </Tabs>
    );
}
