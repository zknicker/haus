import { Button, Surface } from '@heroui/react';
import { CodeBlock } from '@heroui-pro/react/code-block';
import * as React from 'react';
import { cn } from '../../lib/utils.ts';
import { clampTraceText } from './turn-trace-values.ts';

/**
 * The trace's one section label: the stock ChatTool label role (muted, small,
 * uppercase, wide tracking) so `COMMAND`, `OUTPUT`, `REPORT`, and the stock
 * `ARGUMENTS` / `RESULT` all read as one tier above their surfaces.
 */
export function TraceMicroLabel({ children }: { children: React.ReactNode }) {
    return (
        <span className="font-medium text-muted text-xs uppercase tracking-wide">{children}</span>
    );
}

/**
 * A body section that is prose rather than code — a report, a message — on
 * the code blocks' own quiet surface, named by a micro label above it and
 * bounded to a readable height that scrolls.
 */
export function TraceSection({
    children,
    label,
}: {
    children: React.ReactNode;
    label: React.ReactNode;
}) {
    return (
        <section className="grid min-w-0 gap-1">
            <TraceMicroLabel>{label}</TraceMicroLabel>
            <Surface
                className="max-h-72 min-w-0 overflow-y-auto rounded-2xl px-3 py-2"
                variant="secondary"
            >
                {children}
            </Surface>
        </section>
    );
}

/**
 * The trace's one code surface: a labelled snippet with copy, bounded to a
 * readable height that scrolls when the Agent wrote or read something long.
 */
export function TurnTraceCode({
    code,
    label,
    language = 'text',
}: {
    code: string;
    label: string;
    language?: string;
}) {
    // The character clamp is the real bound: a runtime can hand back one
    // unbroken multi-megabyte line, which no height would bound.
    const { clipped: truncated, text } = clampTraceText(code);

    return (
        <div className="grid min-w-0 gap-1.5">
            <CodeBlock className="min-w-0">
                <CodeBlock.Header>
                    <TraceMicroLabel>{label}</TraceMicroLabel>
                    {/* The copy control is icon-only, so it carries the
                        section's own name: "Copy command", "Copy output". */}
                    <CodeBlock.CopyButton aria-label={`Copy ${label.toLowerCase()}`} code={text} />
                </CodeBlock.Header>
                <CodeBlock.Code
                    className="max-h-72 overflow-auto"
                    code={text}
                    language={language}
                />
            </CodeBlock>
            {truncated ? (
                <TurnTraceNote>Only the first 20,000 characters are shown.</TurnTraceNote>
            ) : null}
        </div>
    );
}

/** A single mono fact — a path, a pattern, an MCP tool — above its body. */
export function TurnTraceFact({ label, value }: { label: string; value: string }) {
    return (
        <p className="flex min-w-0 items-baseline gap-2 text-sm">
            <span className="shrink-0 text-muted">{label}</span>
            <span className="min-w-0 truncate font-mono text-foreground">{value}</span>
        </p>
    );
}

export function TurnTraceNote({ children }: { children: React.ReactNode }) {
    return <p className="text-muted text-sm">{children}</p>;
}

/**
 * Model-authored prose a step carries (an image prompt): wrapped at a reading
 * measure, folded to three lines when long, with the rest a press away.
 */
export function TurnTraceProse({ text }: { text: string }) {
    const [expanded, setExpanded] = React.useState(false);
    const bodyId = React.useId();
    const { text: shown } = clampTraceText(text);
    const foldable = shown.length > proseFoldChars || shown.split('\n').length > proseFoldLines;

    return (
        <div className="grid w-full min-w-0 justify-items-start gap-1">
            <p
                className={cn(
                    'max-w-prose whitespace-pre-wrap break-words text-muted text-sm',
                    foldable && !expanded && 'line-clamp-3'
                )}
                id={bodyId}
            >
                {shown}
            </p>
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
        </div>
    );
}

const proseFoldChars = 240;
const proseFoldLines = 3;
