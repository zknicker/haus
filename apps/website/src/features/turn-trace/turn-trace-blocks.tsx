import { Button } from '@heroui/react';
import { CodeBlock } from '@heroui-pro/react/code-block';
import * as React from 'react';
import { cn } from '../../lib/utils.ts';
import { formatTraceFold } from './turn-trace-fold.ts';
import { clampTraceText } from './turn-trace-values.ts';

/**
 * The trace's one section label: muted, `xs`, uppercase, wide tracking, so
 * `COMMAND`, `OUTPUT`, `INPUT`, `RESULT`, `REPORT`, and a fact's `TO` or
 * `FILE` all read as one tier above or beside their content. Labels are the
 * only uppercase text in a body; what they name stays in sentence case.
 */
export function TraceMicroLabel({ children }: { children: React.ReactNode }) {
    return (
        <span className="font-medium text-muted text-xs uppercase tracking-wide">{children}</span>
    );
}

/**
 * A body section that is prose rather than code — a report, a message — on
 * the code blocks' own compact surface and header, so every block in a body
 * is one material with its label and copy in the same place. A long section
 * folds to about eight lines with the rest a press away.
 */
export function TraceSection({
    children,
    copy,
    label,
}: {
    children: React.ReactNode;
    /** The section's source text, for its copy control. */
    copy: string;
    label: string;
}) {
    const [isExpanded, setExpanded] = React.useState(false);
    const { overflows, ref } = useOverflow<HTMLDivElement>(isExpanded);
    const bodyId = React.useId();

    return (
        <CodeBlock className="code-block--compact min-w-0" data-trace-section={label}>
            <CodeBlock.Header>
                <TraceMicroLabel>{label}</TraceMicroLabel>
                <CodeBlock.CopyButton aria-label={`Copy ${label.toLowerCase()}`} code={copy} />
            </CodeBlock.Header>
            <div
                className={cn(
                    'min-w-0 cursor-text px-3 pb-2',
                    !isExpanded && 'max-h-40 overflow-hidden',
                    // A folded prose block cuts mid-line wherever its height lands, so the cut fades.
                    !isExpanded && overflows && 'mask-b-from-[calc(100%-2.5rem)] mask-b-to-100%'
                )}
                id={bodyId}
                ref={ref}
            >
                {children}
            </div>
            {overflows ? (
                <TraceFoldButton
                    controls={bodyId}
                    hiddenLines={null}
                    isExpanded={isExpanded}
                    onToggle={() => setExpanded((current) => !current)}
                />
            ) : null}
        </CodeBlock>
    );
}

/**
 * A long block's fold control, at the block's bottom on its code inset: how
 * many lines it holds back, or how to put them away again.
 */
export function TraceFoldButton({
    controls,
    hiddenLines,
    isExpanded,
    onToggle,
}: {
    controls: string;
    hiddenLines: number | null;
    isExpanded: boolean;
    onToggle: () => void;
}) {
    return (
        <div className="code-block__fold">
            <Button
                aria-controls={controls}
                aria-expanded={isExpanded}
                onPress={onToggle}
                size="sm"
                variant="ghost"
            >
                {formatTraceFold(hiddenLines, isExpanded)}
            </Button>
        </div>
    );
}

/**
 * Short mono facts — a file, a pattern, where a message went — as one
 * aligned list: micro labels in a column, values in sentence case beside them.
 */
export function TurnTraceFacts({ children }: { children: React.ReactNode }) {
    return (
        <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1">
            {children}
        </dl>
    );
}

/** One fact inside `TurnTraceFacts`. */
export function TurnTraceFact({ label, value }: { label: string; value: string }) {
    return (
        <>
            <dt>
                <TraceMicroLabel>{label}</TraceMicroLabel>
            </dt>
            <dd className="min-w-0 truncate font-mono text-foreground text-xs">{value}</dd>
        </>
    );
}

export function TurnTraceNote({ children }: { children: React.ReactNode }) {
    // On the rows' own inline pad, so a note starts where their icons do.
    return <p className="px-2 text-muted text-sm">{children}</p>;
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

/**
 * Whether a height-bounded element clips its content. Measured only while
 * folded, so the answer holds while the reader has it open.
 */
function useOverflow<T extends HTMLElement>(isExpanded: boolean) {
    const ref = React.useRef<T>(null);
    const [overflows, setOverflows] = React.useState(false);
    React.useLayoutEffect(() => {
        const element = ref.current;
        if (!element || isExpanded) {
            return;
        }
        const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        if (element.firstElementChild) {
            observer.observe(element.firstElementChild);
        }
        return () => observer.disconnect();
    }, [isExpanded]);
    return { overflows, ref };
}
