import { CodeBlock } from '@heroui-pro/react/code-block';
import * as React from 'react';
import { countCodeLines, maxHighlightedCodeLength } from '../../lib/code-language.ts';
import { cn } from '../../lib/utils.ts';
import { TraceFoldButton, TraceMicroLabel, TurnTraceNote } from './turn-trace-blocks.tsx';
import { foldTraceLines } from './turn-trace-fold.ts';
import { TraceJson } from './turn-trace-json.tsx';
import { readTraceJson } from './turn-trace-json-model.ts';
import { clampTraceText, stableJson, traceTextMaxChars } from './turn-trace-values.ts';

/**
 * The trace's one code surface: the stock CodeBlock on the theme's compact
 * trace modifier (`.code-block--compact`), a slim header with the section's
 * micro label and copy. Multi-line text carries line numbers; a one-line
 * shell command reads at a `$` prompt instead. A long block folds to eight
 * lines with the rest a press away, and copy always takes the whole text.
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
    // unbroken multi-megabyte line, which no fold would bound.
    const { clipped, text } = clampTraceText(code.replace(/\n+$/, ''));
    const [isExpanded, setExpanded] = React.useState(false);
    const codeId = React.useId();
    const fold = foldTraceLines(text);
    const lines = countCodeLines(text);
    const isPrompt = language === 'shellscript' && lines === 1;

    return (
        <div className="grid min-w-0 gap-1">
            <CodeBlock
                className={cn(
                    'code-block--compact min-w-0',
                    lines > 1 && 'code-block--numbered',
                    isPrompt && 'code-block--prompt'
                )}
                style={{ '--code-line-digits': String(lines).length } as React.CSSProperties}
            >
                <CodeBlock.Header>
                    <TraceMicroLabel>{label}</TraceMicroLabel>
                    {/* The copy control is icon-only, so it carries the
                        section's own name: "Copy command", "Copy output". */}
                    <CodeBlock.CopyButton aria-label={`Copy ${label.toLowerCase()}`} code={text} />
                </CodeBlock.Header>
                <CodeBlock.Code
                    className={cn('cursor-text', isExpanded && 'max-h-[32rem] overflow-y-auto')}
                    code={fold && !isExpanded ? fold.head : text}
                    id={codeId}
                    language={text.length > maxHighlightedCodeLength ? 'text' : language}
                />
                {fold ? (
                    <TraceFoldButton
                        controls={codeId}
                        hiddenLines={fold.hiddenLines}
                        isExpanded={isExpanded}
                        onToggle={() => setExpanded((current) => !current)}
                    />
                ) : null}
            </CodeBlock>
            {clipped ? (
                <TurnTraceNote>Only the first 20,000 characters are shown.</TurnTraceNote>
            ) : null}
        </div>
    );
}

/**
 * A tool payload under its section label: a JSON object or array (or text
 * that parses as one) as a tree, anything else as a code block.
 */
export function TraceValue({
    label,
    language,
    value,
}: {
    label: string;
    language?: string;
    value: unknown;
}) {
    const text = typeof value === 'string' ? value : stableJson(value);
    if (!text?.trim()) {
        return null;
    }
    // A payload past the character bound reads as clamped text with its note, never a partial tree.
    const json = text.length > traceTextMaxChars ? null : readTraceJson(value);
    if (json && Object.keys(json).length > 0) {
        return <TraceJson label={label} value={json} />;
    }
    return <TurnTraceCode code={text} label={label} language={language} />;
}
