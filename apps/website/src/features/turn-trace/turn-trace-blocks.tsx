import { Button } from '@heroui/react';
import { CodeBlock } from '@heroui-pro/react/code-block';
import type { IconSvgElement } from '@hugeicons/react';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { clampTraceText } from './turn-trace-values.ts';

const collapsedLineCount = 24;

/**
 * The trace's one code surface: a labelled snippet with copy, collapsed to a
 * readable height when the Agent wrote or read something long.
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
    const [expanded, setExpanded] = React.useState(false);
    // The character clamp is the real bound: a runtime can hand back one
    // unbroken multi-megabyte line, which no line count would collapse.
    const { clipped: truncated, text } = clampTraceText(code);
    const lines = text.split('\n');
    const clipped = !expanded && lines.length > collapsedLineCount;
    const shown = clipped ? lines.slice(0, collapsedLineCount).join('\n') : text;

    return (
        <div className="grid min-w-0 gap-1.5">
            <CodeBlock className="min-w-0">
                <CodeBlock.Header>
                    <span className="text-muted text-sm">{label}</span>
                    {/* The copy control is icon-only, so it carries the
                        section's own name: "Copy command", "Copy output". */}
                    <CodeBlock.CopyButton aria-label={`Copy ${label.toLowerCase()}`} code={text} />
                </CodeBlock.Header>
                <CodeBlock.Code className="overflow-x-auto" code={shown} language={language} />
            </CodeBlock>
            {lines.length > collapsedLineCount ? (
                <Button
                    className="justify-self-start"
                    onPress={() => setExpanded((current) => !current)}
                    size="sm"
                    variant="ghost"
                >
                    {clipped ? `Show all ${lines.length} lines` : 'Show less'}
                </Button>
            ) : null}
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
 * A trace step that is not a tool call. The transparent border and padding
 * match a ChatTool trigger's box, so its icon sits in each tool's status-icon
 * column and its text on the tool labels' line.
 */
export function TurnTraceStep({
    children,
    icon,
}: {
    children: React.ReactNode;
    icon: IconSvgElement;
}) {
    return (
        <div className="flex min-w-0 gap-2 border border-transparent px-3 py-2 text-sm">
            <span className="flex h-5 shrink-0 items-center">
                <Icon aria-hidden className="size-3.5 text-muted" icon={icon} />
            </span>
            <div className="grid min-w-0 max-w-prose flex-1 justify-items-start gap-1">
                {children}
            </div>
        </div>
    );
}
