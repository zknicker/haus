import {
    agentHtmlSandbox,
    buildVisualSrcDoc,
    clampVisualHeight,
    visualHeights,
} from '@haus/api/widgets/visual/frame';
import * as React from 'react';
import { agentHtmlColorScheme, agentHtmlTokenDeclarations } from '../../agent-html/tokens.ts';
import { useVisualContentHeight } from './use-visual-content-height.ts';

/**
 * Generative visual: model-authored HTML rendered in a sandboxed iframe. The
 * frame document — CSP, sandbox, theme tokens, size reporter — is built by
 * `@haus/api/widgets/visual/frame`, shared with Computer and the visuals lab;
 * this card owns only the iframe, the theme snapshot, and the height handshake.
 */

// While a visual is still streaming, srcdoc rewrites are throttled so the
// browser reparses at a readable cadence instead of per delta.
const streamingRedrawMs = 300;

export function VisualCard({
    html,
    open = false,
    title,
}: {
    html: string;
    open?: boolean;
    title?: string;
}) {
    const displayHtml = useThrottledValue(html, open ? streamingRedrawMs : 0);
    const tokensCss = useVisualTokens();
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const frameRef = React.useRef<HTMLIFrameElement | null>(null);
    const contentHeight = useVisualContentHeight({
        containerRef,
        frameRef,
        html: displayHtml,
        // A throttled body that has not caught up with the closed fence is
        // still a partial document.
        streaming: open || displayHtml !== html,
    });
    const height = clampVisualHeight(contentHeight ?? visualHeights.fallback);

    return (
        // No shell: the visual is a transparent block in the reply column, so
        // the conversation is its container and a card inside it would read as
        // a card in a card. The cap is a drawn figure's measure — the same one
        // narration and legacy widget rows use — not the reply column, which
        // runs wider (ADR 0031).
        <div className="w-full min-w-0 max-w-[46rem]" ref={containerRef}>
            <iframe
                className="block w-full border-0 bg-transparent"
                ref={frameRef}
                sandbox={agentHtmlSandbox}
                srcDoc={buildVisualSrcDoc(displayHtml, tokensCss, agentHtmlColorScheme())}
                style={{ height }}
                title={title ?? 'Visual'}
            />
        </div>
    );
}

function useThrottledValue<Value>(value: Value, delayMs: number): Value {
    const [throttled, setThrottled] = React.useState(value);
    const lastUpdateRef = React.useRef(0);

    React.useEffect(() => {
        if (delayMs <= 0) {
            setThrottled(value);
            return;
        }
        const elapsed = Date.now() - lastUpdateRef.current;
        if (elapsed >= delayMs) {
            lastUpdateRef.current = Date.now();
            setThrottled(value);
            return;
        }
        const timer = setTimeout(() => {
            lastUpdateRef.current = Date.now();
            setThrottled(value);
        }, delayMs - elapsed);
        return () => clearTimeout(timer);
    }, [delayMs, value]);

    return throttled;
}

// Snapshot synchronously on first render — an effect-time srcdoc update can
// race the iframe's initial navigation and leave a tokenless document — and
// again when the app theme flips, so visuals follow the active scheme.
function useVisualTokens() {
    const [tokens, setTokens] = React.useState(() => agentHtmlTokenDeclarations());

    React.useEffect(() => {
        const observer = new MutationObserver(() => setTokens(agentHtmlTokenDeclarations()));
        observer.observe(document.documentElement, {
            attributeFilter: ['data-theme'],
            attributes: true,
        });
        return () => observer.disconnect();
    }, []);

    return tokens;
}
