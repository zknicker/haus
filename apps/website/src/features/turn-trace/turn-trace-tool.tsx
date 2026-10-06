import { ChatTool } from '@heroui-pro/react/chat-tool';
import { StopCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { formatToolDuration } from '../sessions/tools/tool-ui.ts';
import { TurnTraceCode, TurnTraceFact, TurnTraceNote } from './turn-trace-blocks.tsx';
import { formatSubagentMeta } from './turn-trace-subagent.ts';
import { TurnTraceToolBody } from './turn-trace-tool-bodies.tsx';
import type { TurnTraceTool } from './turn-trace-tool-model.ts';
import { clampTraceValue, formatTraceValue, readTraceText } from './turn-trace-values.ts';

/**
 * One tool call in the trace. The row states the verb and its target; the body
 * is whatever that kind of call actually produced. Failures open on their own
 * because they are why someone opened the trace. An interrupted call is not a
 * failure: it stays closed under a muted stop mark, and its note says why.
 */
export function TurnTraceToolCall({ tool }: { tool: TurnTraceTool }) {
    const meta =
        tool.kind === 'subagent'
            ? formatSubagentMeta(tool.source, tool.children.length)
            : formatToolDuration(tool.source.startedAt, tool.source.endedAt ?? null);
    const errorText =
        tool.interrupted || tool.error === undefined
            ? null
            : formatTraceValue(clampTraceValue(tool.error));

    return (
        <ChatTool
            defaultExpanded={tool.state === 'output-error'}
            state={tool.state}
            toolName={tool.source.toolName}
        >
            <ChatTool.Trigger>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                    {tool.interrupted ? (
                        <Icon
                            aria-hidden
                            className="size-3.5 shrink-0 text-muted"
                            icon={StopCircleIcon}
                        />
                    ) : (
                        <ChatTool.StatusIcon />
                    )}
                    <span className="min-w-0 truncate text-left">{tool.label}</span>
                </span>
                {meta ? (
                    <span className="shrink-0 font-mono text-muted text-xs tabular-nums">
                        {meta}
                    </span>
                ) : null}
            </ChatTool.Trigger>
            <ChatTool.Content>
                {tool.kind === 'subagent' ? (
                    <SubagentBody tool={tool} />
                ) : (
                    <TurnTraceToolBody tool={tool} />
                )}
                {tool.preliminary === undefined ? null : (
                    <ChatTool.Result
                        label="Preliminary output"
                        value={clampTraceValue(tool.preliminary)}
                    />
                )}
                {tool.interruption ? <TurnTraceNote>{tool.interruption}</TurnTraceNote> : null}
                {errorText ? <ChatTool.Error errorText={errorText} /> : null}
            </ChatTool.Content>
        </ChatTool>
    );
}

/**
 * A sub-agent's body is its own trace: each call it made, in order, rendered
 * exactly as a top-level call, then the report it handed back.
 */
function SubagentBody({ tool }: { tool: TurnTraceTool }) {
    const subagent = tool.source.subagent;
    const report = tool.state === 'output-available' ? readTraceText(tool.output) : null;
    const latestAction =
        tool.children.length === 0 && tool.state === 'input-available'
            ? (subagent?.latestAction ?? null)
            : null;

    return (
        <>
            {subagent?.subagentType ? (
                <TurnTraceFact label="Type" value={subagent.subagentType} />
            ) : null}
            {tool.children.length > 0 ? (
                <div className="grid min-w-0 gap-2">
                    {tool.children.map((child) => (
                        <TurnTraceToolCall key={child.source.toolCallId} tool={child} />
                    ))}
                </div>
            ) : null}
            {latestAction ? <TurnTraceNote>{latestAction}</TurnTraceNote> : null}
            {report ? <TurnTraceCode code={report} label="Report" /> : null}
        </>
    );
}
