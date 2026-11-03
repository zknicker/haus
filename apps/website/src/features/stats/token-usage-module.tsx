import { ToggleButton, ToggleButtonGroup, Toolbar } from '@heroui/react';
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
                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <Toolbar aria-label="Usage filters">{controls}</Toolbar>
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
        <ToggleButtonGroup
            aria-label="Token usage range"
            disallowEmptySelection
            onSelectionChange={(keys) => {
                const selected = Number([...keys][0]);
                if (selected === 7 || selected === 30 || selected === 90) {
                    onChange(selected);
                }
            }}
            selectedKeys={new Set([String(days)])}
            selectionMode="single"
        >
            {ranges.map((range) => (
                <ToggleButton id={String(range)} key={range}>
                    {range} days
                </ToggleButton>
            ))}
        </ToggleButtonGroup>
    );
}
