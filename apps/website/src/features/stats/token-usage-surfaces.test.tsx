import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TokenConfigurationGrid } from './token-configuration-grid.tsx';
import { TokenTotalKpis } from './token-total-kpis.tsx';
import { TokenUsageChart, TokenUsageTooltip } from './token-usage-chart.tsx';
import { TokenUsageDashboard } from './token-usage-module.tsx';
import type { TokenUsageView } from './token-usage-view.ts';

const totals = {
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
};

test('Agent usage uses the HeroUI Pro dashboard primitives', () => {
    const view: TokenUsageView = {
        agents: [],
        chartSeries: [],
        chartData: [],
        configurations: [],
        selectedAgent: null,
        totals,
    };
    const html = renderToStaticMarkup(
        <>
            <TokenUsageChart view={view} />
            <TokenTotalKpis totals={totals} />
            <TokenConfigurationGrid rows={[]} />
        </>
    );

    expect(html).toContain('data-slot="widget"');
    expect(html).toContain('data-slot="widget-content"');
    expect(html).toContain('data-slot="kpi-group"');
    expect(html).toContain('data-slot="item-card-group-header"');
    expect(html).toContain('Token usage detail');
    expect(html).not.toContain('Agent × runtime × model');
    expect(html.match(/data-slot="kpi"/g)).toHaveLength(4);
    for (const title of ['Processed', 'Fresh input', 'Output', 'Cache hit rate']) {
        expect(html).toContain(title);
    }
});

test('Usage dashboard keeps its filters on the content cluster', () => {
    const view: TokenUsageView = {
        agents: [],
        chartSeries: [],
        chartData: [],
        configurations: [],
        selectedAgent: null,
        totals,
    };
    const html = renderToStaticMarkup(
        <TokenUsageDashboard controls={<button type="button">range</button>} view={view} />
    );

    // The shell band's 3rem chrome cannot host field-height controls, so the
    // filters lead the cluster they act on — then general to specific:
    // totals before the daily trend.
    const toolbar = html.indexOf('aria-label="Usage filters"');
    const kpis = html.indexOf('data-slot="kpi-group"');
    expect(toolbar).toBeGreaterThan(-1);
    expect(toolbar).toBeLessThan(kpis);
    expect(kpis).toBeLessThan(html.indexOf('data-slot="widget"'));
});

test('Token chart follows the Widget chart composition', () => {
    const totalsRow = {
        cacheReadTokens: 90_000,
        cacheWriteTokens: 0,
        inputTokens: 115_000,
        outputTokens: 1200,
        totalTokens: 116_200,
    };
    const configuration = {
        ...totalsRow,
        agentAvatarUrl: '/blippy.png',
        agentHandle: 'blippy',
        agentId: 'blippy',
        agentName: 'Blippy',
        id: 'blippy:codex:gpt-5.6-sol',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        runtimeLabel: 'Codex',
    };
    const series = {
        ...totalsRow,
        agentId: 'blippy',
        color: 'var(--chart-1)',
        id: 'agent:blippy',
        isOther: false as const,
        label: 'Blippy',
    };
    const html = renderToStaticMarkup(
        <TokenUsageChart
            view={{
                agents: [],
                chartData: [
                    {
                        date: '2026-08-14',
                        label: 'Aug 14',
                        [series.id]: series.totalTokens,
                    },
                ],
                chartSeries: [series],
                configurations: [configuration],
                selectedAgent: null,
                totals: totalsRow,
            }}
        />
    );
    const header = html.indexOf('data-slot="widget-header"');
    const legend = html.indexOf('data-slot="widget-legend"');
    const content = html.indexOf('data-slot="widget-content"');

    expect(html).toContain('Daily processed tokens');
    expect(html).not.toContain('/blippy.png');
    // Legend items name the Agent alone; runtime and model live in the table.
    expect(html).not.toContain('gpt-5.6-sol');
    expect(html).not.toContain('Codex');
    expect(header).toBeGreaterThan(-1);
    expect(legend).toBeGreaterThan(header);
    expect(content).toBeGreaterThan(legend);
});

test('Token tooltip names the day like the axis and lists the stack top-down', () => {
    const series = ['agent:a', 'agent:b', 'other'].map((id, index) => ({
        ...totals,
        agentCount: 2,
        color: `var(--chart-${index + 1})`,
        id,
        isOther: true as const,
        label: `Series ${index}`,
    }));
    const html = renderToStaticMarkup(
        <TokenUsageTooltip
            date="2026-09-12"
            series={series}
            values={[
                { dataKey: 'agent:a', value: 10 },
                { dataKey: 'agent:b', value: 0 },
                { dataKey: 'other', value: 30 },
            ]}
        />
    );

    expect(html).not.toContain('2026-09-12');
    expect(html).toContain('12');
    expect(html).toContain('Sep');
    // Bars draw bottom-up in series order, so the last series is the top segment.
    expect(html.indexOf('Series 2')).toBeLessThan(html.indexOf('Series 0'));
    expect(html).not.toContain('Series 1');
});

test('Token KPIs split processed volume without double-counting cache reads', () => {
    const html = renderToStaticMarkup(
        <TokenTotalKpis
            totals={{
                cacheReadTokens: 80_000,
                cacheWriteTokens: 9000,
                inputTokens: 110_000,
                outputTokens: 30_000,
                totalTokens: 140_000,
            }}
        />
    );

    // Fresh input is input minus cache reads; the hit rate is cache reads over input.
    expect(html).toContain('140K');
    expect(html).toContain('30K');
    expect(html).toContain('72.7%');
    expect(html).not.toContain('data-slot="kpi-footer"');
});
