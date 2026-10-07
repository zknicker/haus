import type * as React from 'react';
import { ReferenceMarkdown } from '../mentions/reference-markdown.tsx';
import { TraceSection, TurnTraceNote } from './turn-trace-blocks.tsx';
import { TraceErrorSection } from './turn-trace-call-body.tsx';
import { TraceBody, TraceGroup } from './turn-trace-grid.tsx';
import { traceMark } from './turn-trace-icons.ts';
import { TraceDisclosure, TraceLine } from './turn-trace-row.tsx';
import type { TurnTraceSubagentStep } from './turn-trace-step-types.ts';
import { formatSubagentDetails, formatSubagentToolCount } from './turn-trace-subagent.ts';
import { clampTraceText } from './turn-trace-values.ts';

/**
 * A sub-agent is a row like any call, told apart only by its mark and its
 * step-colored bar — never by a container. Opened, its own calls are rows one
 * depth in on the trace's columns (`children`), between its muted fact line
 * and its named report, which sit on the row's label text.
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
    const closing = latestAction || tool.interruption || tool.report;

    return (
        <TraceDisclosure
            bars={[{ kind: 'step', lane: step.parallel, status, timing }]}
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
            timing={timing}
            tone={status === 'failed' ? 'danger' : 'default'}
        >
            <SubagentRows hasRows={children != null}>
                {tool.failure || details ? (
                    <TraceBody>
                        {tool.failure ? <TraceErrorSection failure={tool.failure} /> : null}
                        {details ? (
                            <p className="text-muted text-sm tabular-nums">{details}</p>
                        ) : null}
                    </TraceBody>
                ) : null}
                {children}
            </SubagentRows>
            {closing ? (
                <TraceBody>
                    {latestAction ? <TurnTraceNote>{latestAction}</TurnTraceNote> : null}
                    {tool.interruption ? <TurnTraceNote>{tool.interruption}</TurnTraceNote> : null}
                    {tool.report ? <SubagentReport report={tool.report} /> : null}
                </TraceBody>
            ) : null}
        </TraceDisclosure>
    );
}

/** Its fact line and own calls share the group rail; the closing report sits past its end. */
function SubagentRows({ children, hasRows }: { children: React.ReactNode; hasRows: boolean }) {
    return hasRows ? <TraceGroup>{children}</TraceGroup> : children;
}

function SubagentReport({ report }: { report: string }) {
    const text = clampTraceText(report).text;
    return (
        <TraceSection copy={text} label="Report">
            <ReferenceMarkdown className="chat-markdown text-foreground text-sm" content={text} />
        </TraceSection>
    );
}
