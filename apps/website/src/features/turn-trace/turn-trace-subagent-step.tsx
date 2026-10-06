import { Surface } from '@heroui/react';
import type * as React from 'react';
import { TurnTraceNote } from './turn-trace-blocks.tsx';
import { TraceFailure } from './turn-trace-call-body.tsx';
import { traceMark } from './turn-trace-icons.ts';
import { TurnTraceMarkdown } from './turn-trace-reasoning.tsx';
import { TraceDisclosure, TraceLine, TraceTiming } from './turn-trace-row.tsx';
import type { TurnTraceSubagentStep } from './turn-trace-step-types.ts';
import { formatSubagentDetails, formatSubagentToolCount } from './turn-trace-subagent.ts';

/**
 * A sub-agent is a row like any call. Opened, it is one anchored block on the
 * row's label column: a muted line of what it was and what it cost, its own
 * calls, and then its report, set apart and named so it never reads as one
 * more step of the trace.
 */
export function TraceSubagentStep({
    children,
    step,
}: {
    children: React.ReactNode;
    step: TurnTraceSubagentStep;
}) {
    const { status, timing, tool } = step;
    const mark = traceMark('subagent', status);
    const toolCount = formatSubagentToolCount(tool.source, tool.children.length);
    const details = formatSubagentDetails(tool.source, timing);
    const latestAction =
        tool.children.length === 0 && status === 'running'
            ? (tool.source.subagent?.latestAction ?? null)
            : null;

    return (
        <TraceDisclosure
            defaultExpanded={status === 'failed'}
            isRunning={timing.isRunning}
            line={
                <TraceLine
                    alert={tool.failedChildCount > 0 ? `${tool.failedChildCount} failed` : null}
                    icon={mark.icon}
                    isRunning={timing.isRunning}
                    label={step.label}
                    meta={toolCount}
                    tone={mark.tone}
                />
            }
            timing={
                <TraceTiming
                    bars={[
                        {
                            lane: step.parallel,
                            timing,
                            tone: step.parallel && status === 'completed' ? 'parallel' : status,
                        },
                    ]}
                    timing={timing}
                />
            }
        >
            {tool.failure ? <TraceFailure failure={tool.failure} /> : null}
            {details ? <p className="text-muted text-sm tabular-nums">{details}</p> : null}
            {children}
            {latestAction ? <TurnTraceNote>{latestAction}</TurnTraceNote> : null}
            {tool.interruption ? <TurnTraceNote>{tool.interruption}</TurnTraceNote> : null}
            {tool.report ? <TraceReport content={tool.report} /> : null}
        </TraceDisclosure>
    );
}

/** The sub-agent's report: model-authored markdown, named and on the same quiet surface as code. */
function TraceReport({ content }: { content: string }) {
    return (
        <Surface className="grid min-w-0 gap-1 rounded-2xl px-3 py-2.5" variant="secondary">
            <span className="text-muted text-sm">Report</span>
            <TurnTraceMarkdown content={content} tone="foreground" />
        </Surface>
    );
}
