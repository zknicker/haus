import type { AgentExecutionJournalReasoning } from '@haus/api';
import { BrainIcon } from '@hugeicons-pro/core-stroke-rounded';
import { parseThinkingSummary } from '../chats/chat-transcript-system-step.tsx';
import { messagePreviewLine } from '../chats/message-preview-line.ts';
import { ReferenceMarkdown } from '../mentions/reference-markdown.tsx';
import { type TraceBar, TraceBody } from './turn-trace-grid.tsx';
import { TraceDisclosure, TraceLine, TraceRow } from './turn-trace-row.tsx';
import type { TurnTraceTiming } from './turn-trace-timing.ts';

/**
 * A reasoning block reads as a step of the trace: a row on the trace grid
 * with the model's own title (or `Thought` when it wrote none) and its first
 * line as muted detail, its bar in the step hue. Like every other step it is
 * one line until opened; open, its prose sits on the row's label text at a
 * readable measure.
 */
export function TurnTraceReasoning({
    isStreaming = false,
    reasoning,
    timing,
}: {
    isStreaming?: boolean;
    reasoning: AgentExecutionJournalReasoning;
    timing: TurnTraceTiming;
}) {
    const { body, title } = readReasoning(reasoning.text);
    const cells = {
        bars: [
            {
                kind: 'step',
                status: isStreaming ? 'running' : 'completed',
                timing,
            } satisfies TraceBar,
        ],
        line: (
            <TraceLine
                detail={body ? messagePreviewLine(body) : null}
                icon={BrainIcon}
                isQuiet
                isRunning={isStreaming}
                label={title ?? 'Thought'}
            />
        ),
        timing,
    };

    if (!(body || reasoning.truncated)) {
        return <TraceRow {...cells} />;
    }
    return (
        <TraceDisclosure {...cells}>
            <TraceBody>
                <div className="grid min-w-0 max-w-prose justify-items-start gap-1">
                    {body ? (
                        <ReferenceMarkdown
                            className="chat-markdown text-muted text-sm"
                            content={body}
                        />
                    ) : null}
                    {reasoning.truncated ? <p className="text-muted text-sm">(truncated)</p> : null}
                </div>
            </TraceBody>
        </TraceDisclosure>
    );
}

/**
 * The title is the model's own heading (Codex opens each summary with one);
 * whatever follows is the body. Untitled reasoning is all body, with no
 * invented label standing in for one.
 */
export function readReasoning(text: string): { body: string | null; title: string | null } {
    const trimmed = text.trim();
    const summary = parseThinkingSummary(trimmed);
    if (summary.description === trimmed) {
        return { body: trimmed, title: null };
    }
    return { body: summary.description ?? null, title: summary.label };
}
