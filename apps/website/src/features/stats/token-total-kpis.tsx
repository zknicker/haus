import { KPIGroup } from '@heroui-pro/react';
import { KPI } from '@heroui-pro/react/kpi';
import {
    ArrowDownLeft01Icon,
    ArrowUpRight01Icon,
    ChartHistogramIcon,
    DatabaseIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import type { TokenTotals } from './token-usage-view.ts';

type IconSvg = Parameters<typeof Icon>[0]['icon'];

/**
 * Four facts that never overlap: input already includes cache reads and
 * writes, and processed is input plus output, so the cards show the total,
 * the input not served from cache, output, and the share of input that was.
 */
export function TokenTotalKpis({ totals }: { totals: TokenTotals }) {
    const freshInput = Math.max(0, totals.inputTokens - totals.cacheReadTokens);
    const cacheHitRate = totals.inputTokens > 0 ? totals.cacheReadTokens / totals.inputTokens : 0;
    return (
        <KPIGroup className="overflow-x-auto">
            <TokenKpi icon={ChartHistogramIcon} title="Processed" value={totals.totalTokens} />
            <KPIGroup.Separator />
            <TokenKpi icon={ArrowDownLeft01Icon} title="Fresh input" value={freshInput} />
            <KPIGroup.Separator />
            <TokenKpi icon={ArrowUpRight01Icon} title="Output" value={totals.outputTokens} />
            <KPIGroup.Separator />
            <TokenKpi icon={DatabaseIcon} percent title="Cache hit rate" value={cacheHitRate} />
        </KPIGroup>
    );
}

function TokenKpi({
    icon,
    percent = false,
    title,
    value,
}: {
    icon: IconSvg;
    percent?: boolean;
    title: string;
    value: number;
}) {
    return (
        <KPI>
            <KPI.Header>
                {/* KPI.Icon is a 32px status-tinted box; a neutral metric takes
                    the bare muted glyph the KPI anatomy uses instead. */}
                <Icon className="size-4 text-muted" icon={icon} />
                <KPI.Title>{title}</KPI.Title>
            </KPI.Header>
            <KPI.Content>
                <KPI.Value
                    maximumFractionDigits={1}
                    notation={percent ? 'standard' : 'compact'}
                    style={percent ? 'percent' : 'decimal'}
                    value={value}
                />
            </KPI.Content>
        </KPI>
    );
}
