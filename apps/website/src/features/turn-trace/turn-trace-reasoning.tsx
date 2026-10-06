import type { AgentExecutionJournalReasoning } from '@haus/api';
import { Button } from '@heroui/react';
import { BrainIcon } from '@hugeicons-pro/core-stroke-rounded';
import { motion, useReducedMotion } from 'motion/react';
import * as React from 'react';
import { springs } from '../../lib/springs.ts';
import { cn } from '../../lib/utils.ts';
import { parseThinkingSummary } from '../chats/chat-transcript-system-step.tsx';
import { ReferenceMarkdown } from '../mentions/reference-markdown.tsx';
import { TraceBody } from './turn-trace-grid.tsx';
import { TraceLine, TraceRow } from './turn-trace-row.tsx';
import type { TurnTraceTiming } from './turn-trace-timing.ts';

/** Lines a long thought shows before it asks to be opened. */
export const reasoningCollapsedLines = 6;
// Roughly one line of the prose measure (`max-w-prose`, 65ch) at the body
// size; the Turn details drawer's column is about the same width.
const charactersPerLine = 80;
// Markdown's own line height, so the collapsed box ends on a line boundary.
const markdownLineHeightEm = 1.625;

/**
 * A reasoning block reads as a step of the trace: a row on the trace grid
 * with the model's own title (or `Thought` when it wrote none), its bar in the
 * step hue, and its prose below on the row's label text at a readable measure.
 * Reasoning is readable in place; only a long thought folds.
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

    return (
        <div className="grid min-w-0">
            <TraceRow
                bars={[
                    {
                        kind: 'step',
                        status: isStreaming ? 'running' : 'completed',
                        timing,
                    },
                ]}
                line={
                    <TraceLine
                        icon={BrainIcon}
                        isQuiet
                        isRunning={isStreaming}
                        label={title ?? 'Thought'}
                    />
                }
                timing={timing}
            />
            {body || reasoning.truncated ? (
                <TraceBody>
                    <div className="grid min-w-0 max-w-prose justify-items-start gap-1">
                        {body ? <TurnTraceMarkdown content={body} /> : null}
                        {reasoning.truncated ? (
                            <p className="text-muted text-sm">(truncated)</p>
                        ) : null}
                    </div>
                </TraceBody>
            ) : null}
        </div>
    );
}

/**
 * A thought's prose through the message renderer, muted as the Agent's
 * working notes, folded to six lines when long.
 */
function TurnTraceMarkdown({ content: body }: { content: string }) {
    const reducedMotion = useReducedMotion();
    const [expanded, setExpanded] = React.useState(false);
    const bodyId = React.useId();
    const foldable = shouldFoldReasoning(body);
    const folded = foldable && !expanded;

    return (
        <>
            <motion.div
                animate={{
                    height: folded ? `${reasoningCollapsedLines * markdownLineHeightEm}em` : 'auto',
                }}
                // `scroll-fade-b`: a folded thought trails off rather than
                // ending mid-sentence on a hard edge.
                className={cn('w-full overflow-hidden', folded && 'scroll-fade-b')}
                id={bodyId}
                initial={false}
                transition={reducedMotion ? { duration: 0 } : springs.drawer}
            >
                <ReferenceMarkdown className="chat-markdown text-muted text-sm" content={body} />
            </motion.div>
            {foldable ? (
                <Button
                    aria-controls={bodyId}
                    aria-expanded={expanded}
                    onPress={() => setExpanded((current) => !current)}
                    size="sm"
                    variant="ghost"
                >
                    {expanded ? 'Show less' : 'Show more'}
                </Button>
            ) : null}
        </>
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

/** Decided from the text, not a measurement, so the fold never appears a frame late. */
export function shouldFoldReasoning(body: string): boolean {
    const lines = body.split('\n').reduce((total, line) => {
        // A blank line is paragraph spacing, about half a line of prose.
        const trimmed = line.trim();
        return total + (trimmed ? Math.ceil(trimmed.length / charactersPerLine) : 0.5);
    }, 0);
    // A fold that hides only a few lines costs more than it saves.
    return lines > reasoningCollapsedLines + 4;
}
