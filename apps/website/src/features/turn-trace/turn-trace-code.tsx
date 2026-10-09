import * as React from 'react';
import { CompactCode, CompactCodeBlock } from '../../components/code/compact-code-block.tsx';
import { cn } from '../../lib/utils.ts';
import { TraceFoldButton, TurnTraceNote } from './turn-trace-blocks.tsx';
import { foldTraceLines } from './turn-trace-fold.ts';
import { TraceJson } from './turn-trace-json.tsx';
import { readTraceJson } from './turn-trace-json-model.ts';
import { clampTraceText, stableJson, traceTextMaxChars } from './turn-trace-values.ts';

/**
 * The trace's code evidence on the shared compact code block, folded to eight
 * lines when long with the rest a press away. Copy always takes the whole text.
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

    return (
        <div className="grid min-w-0 gap-1">
            <CompactCodeBlock code={text} label={label} language={language}>
                <CompactCode
                    className={cn(isExpanded && 'max-h-[32rem] overflow-y-auto')}
                    code={fold && !isExpanded ? fold.head : text}
                    id={codeId}
                    language={language}
                />
                {fold ? (
                    <TraceFoldButton
                        controls={codeId}
                        hiddenLines={fold.hiddenLines}
                        isExpanded={isExpanded}
                        onToggle={() => setExpanded((current) => !current)}
                    />
                ) : null}
            </CompactCodeBlock>
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
