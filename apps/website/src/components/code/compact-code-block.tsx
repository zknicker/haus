import { CodeBlock } from '@heroui-pro/react/code-block';
import type * as React from 'react';
import { countCodeLines, maxHighlightedCodeLength } from '../../lib/code-language.ts';
import { cn } from '../../lib/utils.ts';
import { MicroLabel } from '../micro-label.tsx';

interface CompactCodeBlockProps {
    /**
     * The painted body when the host shows less than `code`, such as a folded
     * head and its control. Defaults to the whole `code`.
     */
    children?: React.ReactNode;
    /** The whole source: what copy takes, and what sizes the line gutter. */
    code: string;
    /** The copy control's name; defaults to "Copy <label>". */
    copyLabel?: string;
    label: string;
    /** Shiki language id. */
    language?: string;
}

/**
 * Haus's one surface for code read in place: a fenced block in a rendered
 * message and a turn trace's command or output. The stock CodeBlock on the
 * theme's `.code-block--compact` modifier, with a slim header holding the
 * micro label and copy. Long lines soft-wrap, so a block never widens its
 * column. Multi-line code carries line numbers that hang beside wrapped rows,
 * and a one-line shell command reads at a `$` prompt.
 */
export function CompactCodeBlock({
    children,
    code,
    copyLabel,
    label,
    language = 'text',
}: CompactCodeBlockProps) {
    const lines = countCodeLines(code);
    // A command that already carries its own prompt keeps it rather than doubling it.
    const isPrompt = language === 'shellscript' && lines === 1 && !code.startsWith('$');

    return (
        <CodeBlock
            className={cn(
                'code-block--compact min-w-0',
                lines > 1 && 'code-block--numbered',
                isPrompt && 'code-block--prompt'
            )}
            style={{ '--code-line-digits': String(lines).length } as React.CSSProperties}
        >
            <CodeBlock.Header>
                <MicroLabel>{label}</MicroLabel>
                {/* The copy control is icon-only, so it carries the block's own name. */}
                <CodeBlock.CopyButton
                    aria-label={copyLabel ?? `Copy ${label.toLowerCase()}`}
                    code={code}
                />
            </CodeBlock.Header>
            {children ?? <CompactCode code={code} language={language} />}
        </CodeBlock>
    );
}

/**
 * A compact block's code body. Text past the highlight bound paints as plain
 * text, since Shiki tokenizes on the main thread.
 */
export function CompactCode({
    className,
    code,
    id,
    language = 'text',
}: {
    /** Layout for a bounded body, such as an expanded fold's scroll height. */
    className?: string;
    code: string;
    id?: string;
    language?: string;
}) {
    return (
        <CodeBlock.Code
            className={cn('cursor-text', className)}
            code={code}
            id={id}
            language={code.length > maxHighlightedCodeLength ? 'text' : language}
        />
    );
}
