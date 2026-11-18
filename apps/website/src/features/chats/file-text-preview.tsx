import { agentHtmlSandbox } from '@haus/api/widgets/visual/frame';
import { useMemo } from 'react';
import { agentHtmlTokenCss, injectHostTokenStyle } from '../../agent-html/tokens.ts';
import type { SelectionQuoteSource } from '../../components/quote/selection-quote.tsx';
import { useResolvedThemeOptional } from '../../components/theme-provider.tsx';
import { ChatMarkdownText } from './chat-markdown-text.tsx';
import { FileCodeView } from './file-code-view.tsx';

/** How a text file draws: a sandboxed page, rendered Markdown, or source. */
export type FileTextRenderer = 'code' | 'html' | 'markdown';

/**
 * One text file's contents, drawn the same way wherever a file is opened: the
 * Artifact Panel's workspace files and the shared artifact viewer. The host
 * decides the renderer (a Raw toggle is just `code`) and owns the frame; this
 * fills it.
 */
export function FileTextPreview({
    content,
    path,
    quoteSource,
    renderer,
}: {
    content: string;
    path: string;
    quoteSource: SelectionQuoteSource;
    renderer: FileTextRenderer;
}) {
    if (renderer === 'html') {
        return <FileHtmlPreview content={content} path={path} />;
    }
    if (renderer === 'markdown') {
        return (
            <div className="h-full overflow-auto px-6 py-5 text-base">
                <ChatMarkdownText content={content} />
            </div>
        );
    }
    return <FileCodeView content={content} path={path} quoteSource={quoteSource} />;
}

/**
 * Sandboxed HTML preview with host tokens riding in: artifacts (and any
 * workspace HTML file) get the app's resolved theme variables injected, so a
 * page styled with tokens wears the Haus look and follows the app scheme.
 * Opaque origin, never allow-same-origin.
 */
function FileHtmlPreview({ content, path }: { content: string; path: string }) {
    const scheme = useResolvedThemeOptional();
    const srcDoc = useMemo(
        () => injectHostTokenStyle(content, agentHtmlTokenCss(scheme)),
        [content, scheme]
    );

    return (
        <iframe
            className="h-full min-h-0 w-full"
            sandbox={agentHtmlSandbox}
            srcDoc={srcDoc}
            style={{ colorScheme: scheme }}
            title={path}
        />
    );
}
