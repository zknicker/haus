import { CodeBlock } from '@heroui-pro/react/code-block';
import type { CSSProperties } from 'react';
import {
    SelectionQuoteContainer,
    type SelectionQuoteSource,
} from '../../components/quote/selection-quote.tsx';
import { codeHighlightLanguage, countCodeLines } from '../../lib/code-language.ts';

/**
 * Read-only, IDE-style view of a text file: the stock CodeBlock (the app's one
 * shiki renderer) with soft wrap and a hanging line-number gutter.
 *
 * Numbers are CSS counters on shiki's per-line spans (`.code-block--numbered .line` in the
 * theme), so a wrapped line keeps its number on its first row and copying or
 * quoting code never carries numbers. The view only sizes the number column
 * from the line count. Large files skip tokenizing (`codeHighlightLanguage`)
 * and stay plain, unnumbered text.
 */
export function FileCodeView({
    content,
    path,
    quoteSource,
}: {
    content: string;
    path: string;
    /** Where a quoted selection links back to. */
    quoteSource: SelectionQuoteSource;
}) {
    const digits = String(countCodeLines(content)).length;

    return (
        <div
            className="code-pane h-full min-h-0 overflow-y-auto"
            style={{ '--code-line-digits': digits } as CSSProperties}
        >
            <SelectionQuoteContainer source={quoteSource}>
                <CodeBlock className="code-block--numbered">
                    <CodeBlock.Code
                        code={content}
                        language={codeHighlightLanguage(path, content)}
                    />
                </CodeBlock>
            </SelectionQuoteContainer>
        </div>
    );
}
