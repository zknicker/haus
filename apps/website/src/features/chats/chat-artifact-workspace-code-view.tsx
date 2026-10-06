import { CodeBlock } from '@heroui-pro/react/code-block';
import type { CSSProperties } from 'react';
import { SelectionQuoteContainer } from '../../components/quote/selection-quote.tsx';
import { codeHighlightLanguage, countCodeLines } from '../../lib/code-language.ts';
import { formatHausResourceLink, type HausResourceTarget } from './haus-resource-link.ts';

/**
 * Read-only, IDE-style view of a workspace text file: the stock CodeBlock (the
 * app's one shiki renderer) with soft wrap and a hanging line-number gutter.
 *
 * Numbers are CSS counters on shiki's per-line spans (`.code-pane .line` in the
 * theme), so a wrapped line keeps its number on its first row and copying or
 * quoting code never carries numbers. The view only sizes the number column
 * from the line count. Large files skip tokenizing (`codeHighlightLanguage`)
 * and stay plain, unnumbered text.
 */
export function WorkspaceCodeView({
    content,
    path,
    target,
}: {
    content: string;
    path: string;
    target: Extract<HausResourceTarget, { kind: 'workspaceFile' }>;
}) {
    const digits = String(countCodeLines(content)).length;

    return (
        <div
            className="code-pane h-full min-h-0 overflow-y-auto"
            style={{ '--code-pane-digits': digits } as CSSProperties}
        >
            <SelectionQuoteContainer source={{ href: formatHausResourceLink(target), label: path }}>
                <CodeBlock>
                    <CodeBlock.Code
                        code={content}
                        language={codeHighlightLanguage(path, content)}
                    />
                </CodeBlock>
            </SelectionQuoteContainer>
        </div>
    );
}
