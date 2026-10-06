import type { AgentExecutionJournalReasoning } from '@haus/api';
import { Button } from '@heroui/react';
import { TextShimmer } from '@heroui-pro/react';
import { BrainIcon } from '@hugeicons-pro/core-stroke-rounded';
import { motion, useReducedMotion } from 'motion/react';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { springs } from '../../lib/springs.ts';
import { cn } from '../../lib/utils.ts';
import { parseThinkingSummary } from '../chats/chat-transcript-system-step.tsx';
import { ReferenceMarkdown } from '../mentions/reference-markdown.tsx';

/** Lines a long thought shows before it asks to be opened. */
export const reasoningCollapsedLines = 6;
// Roughly one line of the prose measure (`max-w-prose`, 65ch) at the body
// size; the Turn details drawer's column is about the same width.
const charactersPerLine = 80;
// Markdown's own line height, so the collapsed box ends on a line boundary.
const markdownLineHeightEm = 1.625;

/**
 * A reasoning block reads as a step of the trace: the same icon column as a
 * call, the model's own title when it wrote one, and its prose at a readable
 * measure. Reasoning is readable in place; only a long thought folds.
 */
export function TurnTraceReasoning({
    isStreaming = false,
    reasoning,
    timing,
}: {
    isStreaming?: boolean;
    reasoning: AgentExecutionJournalReasoning;
    timing?: React.ReactNode;
}) {
    const { body, title } = readReasoning(reasoning.text);

    return (
        <div className="flex min-w-0 items-start gap-3 text-sm">
            <div className="flex min-w-0 flex-1 gap-2 py-1.5">
                <span className="flex h-5 shrink-0 items-center">
                    <Icon aria-hidden className="size-3.5 text-muted" icon={BrainIcon} />
                </span>
                <div className="grid min-w-0 max-w-prose flex-1 justify-items-start gap-1">
                    {title ? (
                        isStreaming ? (
                            <TextShimmer className="text-muted">{title}</TextShimmer>
                        ) : (
                            <p className="text-muted">{title}</p>
                        )
                    ) : null}
                    {body ? <TurnTraceMarkdown content={body} /> : null}
                    {reasoning.truncated ? <p className="text-muted">(truncated)</p> : null}
                </div>
            </div>
            {timing ? <span className="flex h-8 items-center">{timing}</span> : null}
        </div>
    );
}

/**
 * Model-authored markdown in the trace — a thought, a sub-agent's report —
 * through the message renderer, folded to six lines when long.
 */
export function TurnTraceMarkdown({
    content: body,
    tone = 'muted',
}: {
    content: string;
    /** `foreground` for text someone else reads as a message, not the Agent's working notes. */
    tone?: 'foreground' | 'muted';
}) {
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
                <ReferenceMarkdown
                    className={cn(
                        'chat-markdown text-sm',
                        tone === 'muted' ? 'text-muted' : 'text-foreground'
                    )}
                    content={body}
                />
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
