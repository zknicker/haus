import type { UsageOverview } from '@haus/api';
import { BarChart } from '@heroui-pro/react/bar-chart';
import { Card } from '@heroui/react';
import { AiAudioIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { UsageSpendSummary } from './usage-spend-summary.tsx';
import { openRouterKeyColors, useUsageSpend } from './use-usage-spend.ts';

export function UsageSpendModule({ liveUsage }: { liveUsage: UsageOverview }) {
    const { chartData, emptyChartMessage, grandTotal, hasChart, keyStats, keys } =
        useUsageSpend(liveUsage);

    if (!hasChart) {
        return (
            <Card>
                <Card.Header>
                    <Card.Title className="text-base">
                        <span className="flex items-center gap-2">
                            <Icon aria-hidden="true" icon={AiAudioIcon} size={20} />
                            OpenRouter
                        </span>
                    </Card.Title>
                </Card.Header>
                <Card.Content>
                    <div className="flex h-32 items-center justify-center">
                        <div className="max-w-sm text-center">
                            <p className="text-base font-medium">No usage yet</p>
                            <p className="text-muted mt-1 text-sm">{emptyChartMessage}</p>
                        </div>
                    </div>
                </Card.Content>
            </Card>
        );
    }

    return (
        <Card className="overflow-hidden">
            <Card.Header>
                <Card.Title className="text-base">
                    <span className="flex items-center gap-2">
                        <Icon aria-hidden="true" icon={AiAudioIcon} size={20} />
                        OpenRouter
                    </span>
                </Card.Title>
            </Card.Header>
            <Card.Content>
                <div className="h-48">
                    <BarChart data={chartData} height={192}>
                        <BarChart.Grid vertical={false} />
                        <BarChart.XAxis dataKey="day" tickMargin={8} />
                        <BarChart.YAxis
                            tickFormatter={(value: number) => `$${value.toFixed(0)}`}
                            width={40}
                        />
                        {keys.map((key, index) => (
                            <BarChart.Bar
                                dataKey={key.id}
                                fill={openRouterKeyColors[index % openRouterKeyColors.length]}
                                key={key.id}
                                name={key.label}
                                // Only the topmost segment rounds, so the stack reads as one bar.
                                radius={index === keys.length - 1 ? [4, 4, 0, 0] : undefined}
                                stackId="spend"
                            />
                        ))}
                        <BarChart.Tooltip
                            content={
                                <BarChart.TooltipContent
                                    valueFormatter={(value) => `$${Number(value).toFixed(2)}`}
                                />
                            }
                        />
                    </BarChart>
                </div>
                <UsageSpendSummary grandTotal={grandTotal} stats={keyStats} />
            </Card.Content>
        </Card>
    );
}
