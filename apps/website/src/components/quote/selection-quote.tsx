import { QuoteDownIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';

import { requestChatComposerFocus } from '../../commands/chat-composer-focus.ts';
import {
    requestChatComposerInsert,
    useChatComposerInsertTarget,
} from '../../commands/chat-composer-insert.ts';
import { cn } from '../../lib/utils.ts';
import { Icon } from '../ui/icon.tsx';

export interface SelectionQuoteSource {
    /** haus:// link inserted under the quote so the agent can open it. */
    href: string;
    label: string;
}

// The universal review gesture: select text in an inspectable surface (file
// preview, Wiki page, diff) and quote it into the chat composer with a
// haus:// source link. Wrap any readable surface; the affordance hides
// when no composer is mounted.
export function SelectionQuoteContainer({
    children,
    className,
    source,
}: {
    children: React.ReactNode;
    className?: string;
    source: SelectionQuoteSource | (() => SelectionQuoteSource);
}) {
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const lastPointerRef = React.useRef<null | { x: number; y: number }>(null);
    const [anchor, setAnchor] = React.useState<null | { text: string; x: number; y: number }>(null);
    const composerPresent = useChatComposerInsertTarget();

    React.useEffect(() => {
        if (!composerPresent) {
            return;
        }

        const readSelection = () => {
            const container = containerRef.current;
            if (!container) {
                setAnchor(null);
                return;
            }
            const containerRect = container.getBoundingClientRect();

            // Text controls (the workspace file editor is a textarea over a
            // highlighted pre) keep their selection on the element, not in
            // window.getSelection(). Anchor near the pointer release.
            const active = document.activeElement;
            if (active instanceof HTMLTextAreaElement && container.contains(active)) {
                const start = Math.min(active.selectionStart ?? 0, active.selectionEnd ?? 0);
                const end = Math.max(active.selectionStart ?? 0, active.selectionEnd ?? 0);
                const text = active.value.slice(start, end).trim();
                if (!text) {
                    setAnchor(null);
                    return;
                }
                const pointer = lastPointerRef.current;
                setAnchor({
                    text,
                    x: clamp(
                        (pointer?.x ?? containerRect.left + containerRect.width / 2) -
                            containerRect.left,
                        24,
                        containerRect.width - 24
                    ),
                    y: Math.max((pointer?.y ?? containerRect.top + 40) - containerRect.top, 30),
                });
                return;
            }

            const selection = window.getSelection();
            if (!selection || selection.isCollapsed) {
                setAnchor(null);
                return;
            }
            const text = selection.toString().trim();
            if (!text || selection.rangeCount === 0) {
                setAnchor(null);
                return;
            }
            const range = selection.getRangeAt(0);
            if (!containsRange(container, range)) {
                setAnchor(null);
                return;
            }
            const rect = range.getBoundingClientRect();
            setAnchor({
                text,
                x: clamp(
                    rect.left + rect.width / 2 - containerRect.left,
                    24,
                    containerRect.width - 24
                ),
                y: rect.top - containerRect.top,
            });
        };

        // Read directly: selectionchange is already coalesced by the browser,
        // and rAF-deferred reads never run in hidden documents.
        document.addEventListener('selectionchange', readSelection);
        return () => document.removeEventListener('selectionchange', readSelection);
    }, [composerPresent]);

    const quoteSelection = () => {
        if (!anchor) {
            return;
        }
        const resolved = typeof source === 'function' ? source() : source;
        requestChatComposerInsert(buildQuoteInsert(anchor.text, resolved));
        requestChatComposerFocus();
        window.getSelection()?.removeAllRanges();
        setAnchor(null);
    };

    return (
        <div
            className={cn('relative', className)}
            onPointerUpCapture={(event) => {
                lastPointerRef.current = { x: event.clientX, y: event.clientY };
            }}
            ref={containerRef}
        >
            {children}
            {anchor && composerPresent ? (
                <button
                    className="card-shell border-border bg-overlay text-overlay-foreground shadow-overlay hover:bg-surface-hover absolute z-20 flex -translate-x-1/2 translate-y-[calc(-100%-6px)] items-center gap-1.5 border px-2.5 py-1 text-sm whitespace-nowrap"
                    onClick={quoteSelection}
                    onMouseDown={(event) => event.preventDefault()}
                    style={{ left: anchor.x, top: Math.max(anchor.y, 30) }}
                    type="button"
                >
                    <Icon className="size-3.5" icon={QuoteDownIcon} strokeWidth={1.7} />
                    Quote in chat
                </button>
            ) : null}
        </div>
    );
}

export function buildQuoteInsert(selectionText: string, source: SelectionQuoteSource) {
    const quoted = selectionText
        .replace(/\r\n/gu, '\n')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    return `${quoted}\n\n[${source.label}](${source.href})\n\n`;
}

function containsRange(container: HTMLElement, range: Range) {
    return container.contains(range.startContainer) && container.contains(range.endContainer);
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), Math.max(min, max));
}
