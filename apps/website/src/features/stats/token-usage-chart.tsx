import { ChartTooltip, Widget } from '@heroui-pro/react';
import { BarChart } from '@heroui-pro/react/bar-chart';
import { formatUsageDay, type TokenUsageView } from './token-usage-view.ts';
import { formatTokens } from './usage-format.ts';

export function TokenUsageChart({
    emptyMessage = 'Token usage will appear after a Haus Agent completes a model turn.',
    view,
}: {
    emptyMessage?: string;
    view: TokenUsageView;
}) {
    // An empty range still has real dates and a real scale, so draw the chart
    // rather than a placeholder panel: the frame is the answer, and the caption
    // says why it is flat.
    if (view.totals.totalTokens === 0) {
        return (
            <Widget>
                <Widget.Header>
                    <Widget.Title>Daily processed tokens</Widget.Title>
                </Widget.Header>
                <Widget.Content className="grid gap-3">
                    <BarChart
                        data={view.chartData.map((point) => ({ ...point, empty: 0 }))}
                        height={220}
                    >
                        {/* The placeholder domain tops out at 1, a value that means
                            nothing here; syncing to the axis ticks keeps the baseline
                            and drops the gridline floating above it. */}
                        <BarChart.Grid syncWithTicks vertical={false} />
                        <BarChart.XAxis
                            dataKey="date"
                            tickFormatter={(value: string) => formatUsageDay(value)}
                            tickMargin={8}
                        />
                        <BarChart.YAxis
                            domain={[0, 1]}
                            tickFormatter={(value: number) => formatTokens(value)}
                            ticks={[0]}
                            width={48}
                        />
                        {/* Recharts derives the numeric scale from the series, so
                            a zero-height bar is what keeps the baseline drawn. */}
                        <BarChart.Bar dataKey="empty" fill="transparent" />
                    </BarChart>
                    <p className="text-muted text-sm">{emptyMessage}</p>
                </Widget.Content>
            </Widget>
        );
    }

    return (
        <Widget>
            <Widget.Header>
                <Widget.Title>Daily processed tokens</Widget.Title>
                <Widget.Legend>
                    {view.chartSeries.map((series) => (
                        <Widget.LegendItem color={series.color} key={series.id}>
                            {series.label}
                        </Widget.LegendItem>
                    ))}
                </Widget.Legend>
            </Widget.Header>
            <Widget.Content>
                <BarChart data={view.chartData} height={220}>
                    <BarChart.Grid vertical={false} />
                    <BarChart.XAxis
                        dataKey="date"
                        tickFormatter={(value: string) => formatUsageDay(value)}
                        tickMargin={8}
                    />
                    <BarChart.YAxis
                        tickFormatter={(value: number) => formatTokens(value)}
                        width={48}
                    />
                    {view.chartSeries.map((series, index) => (
                        <BarChart.Bar
                            dataKey={series.id}
                            fill={series.color}
                            key={series.id}
                            name={series.label}
                            radius={
                                index === view.chartSeries.length - 1 ? [4, 4, 0, 0] : undefined
                            }
                            stackId="tokens"
                        />
                    ))}
                    <BarChart.Tooltip
                        content={({ active, label, payload }) =>
                            active && payload?.length ? (
                                <TokenUsageTooltip
                                    date={String(label)}
                                    series={view.chartSeries}
                                    values={payload}
                                />
                            ) : null
                        }
                    />
                </BarChart>
            </Widget.Content>
        </Widget>
    );
}

/**
 * Rows read top-down like the stack: the last-drawn (top) segment first, so
 * Other leads when present.
 */
export function TokenUsageTooltip({
    date,
    series,
    values,
}: {
    date: string;
    series: TokenUsageView['chartSeries'];
    values: readonly { dataKey?: unknown; value?: unknown }[];
}) {
    const rows = [...series].reverse().flatMap((item) => {
        const value = Number(values.find((entry) => entry.dataKey === item.id)?.value ?? 0);
        return value > 0 ? [{ item, value }] : [];
    });
    return (
        <ChartTooltip indicator="line">
            <ChartTooltip.Header>{formatUsageDay(date)}</ChartTooltip.Header>
            {rows.map(({ item, value }) => (
                <ChartTooltip.Item key={item.id}>
                    <ChartTooltip.Indicator color={item.color} />
                    <ChartTooltip.Label>{item.label}</ChartTooltip.Label>
                    <ChartTooltip.Value>{formatTokens(value)}</ChartTooltip.Value>
                </ChartTooltip.Item>
            ))}
        </ChartTooltip>
    );
}
