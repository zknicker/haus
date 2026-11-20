import {
    type AgentReasoningEffort,
    agentReasoningEffortLabels,
    type ModelConnection,
    modelReasoningEfforts,
} from '@haus/api';
import { Card, Label, Slider } from '@heroui/react';
import { ModelAccountLogo } from '../settings/models/connections/model-account-mark.tsx';
import { type AgentModelOption, contextWindowLabel } from './agent-model-options.ts';

export function AgentModelDetail({
    connection,
    onReasoningChange,
    option,
    reasoningEffort,
}: {
    connection: ModelConnection | null;
    onReasoningChange: (effort: AgentReasoningEffort) => void;
    option: AgentModelOption;
    reasoningEffort: AgentReasoningEffort;
}) {
    const efforts = modelReasoningEfforts(option.model);
    const usage = usageLeft(connection);
    const index = Math.max(0, efforts.indexOf(reasoningEffort));

    return (
        <Card variant="secondary">
            <Card.Header className="flex flex-row items-center gap-2">
                <ModelAccountLogo account={option.provider} />
                <Card.Title>{option.label}</Card.Title>
            </Card.Header>
            <Card.Content className="grid gap-3">
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                    {option.model.contextWindow ? (
                        <>
                            <dt className="text-muted">Context</dt>
                            <dd>{contextWindowLabel(option.model.contextWindow)}</dd>
                        </>
                    ) : null}
                    {usage ? (
                        <>
                            <dt className="text-muted">{usage.label} left</dt>
                            <dd className="tabular-nums">{usage.percent}%</dd>
                        </>
                    ) : null}
                </dl>
                {efforts.length > 1 ? (
                    <Slider
                        maxValue={efforts.length - 1}
                        minValue={0}
                        onChange={(value) => {
                            const effort = efforts[typeof value === 'number' ? value : 0];
                            if (effort) {
                                onReasoningChange(effort);
                            }
                        }}
                        step={1}
                        value={index}
                    >
                        <Label>Reasoning</Label>
                        <Slider.Output>
                            {agentReasoningEffortLabels[efforts[index] ?? reasoningEffort]}
                        </Slider.Output>
                        <Slider.Track>
                            <Slider.Fill />
                            <Slider.Thumb />
                        </Slider.Track>
                    </Slider>
                ) : null}
            </Card.Content>
        </Card>
    );
}

function usageLeft(connection: ModelConnection | null) {
    const windows = connection?.capacity ?? [];
    const tightest = [...windows].sort((left, right) => right.usedPercent - left.usedPercent)[0];
    return tightest
        ? { label: tightest.label, percent: Math.round(100 - tightest.usedPercent) }
        : null;
}
