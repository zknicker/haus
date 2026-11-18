import * as React from 'react';
import { codeLanguageForFence } from '../../lib/code-language.ts';
import { CompactCodeBlock } from './compact-code-block.tsx';

/**
 * The Markdown `pre` element: a fenced block in rendered Markdown on the same
 * compact code surface a turn trace uses. react-markdown hands `pre` its one
 * `code` child, whose `language-*` class names the fence and whose text is the
 * source. Inline code never reaches here.
 */
export function MarkdownCodeBlock({ children }: { children?: React.ReactNode }) {
    const fence = readFence(children);
    if (!fence) {
        return <pre>{children}</pre>;
    }
    const language = codeLanguageForFence(fence.info);
    return (
        <CompactCodeBlock
            code={fence.code}
            copyLabel="Copy code"
            label={language.label}
            language={language.id}
        />
    );
}

function readFence(children: React.ReactNode) {
    if (!React.isValidElement<{ children?: React.ReactNode; className?: string }>(children)) {
        return null;
    }
    const { children: source, className } = children.props;
    return {
        code: React.Children.toArray(source).join('').replace(/\n$/, ''),
        info: className?.match(/language-(\S+)/)?.[1],
    };
}
