import * as React from 'react';
import { cn } from '../../lib/utils.ts';
import { chatFooterClearance } from './chat-footer-clearance.ts';

/**
 * Bottom padding for a transcript viewport inside a `ChatFooterSurface`: the
 * measured footer plus a small gap, so the last message rests just above the
 * composer when scrolled to the end.
 */
export const chatFooterClearanceClassName = 'pb-[calc(var(--chat-footer-height,0px)+1.5rem)]';

/**
 * A transcript region whose footer (the composer, or what replaces it) floats
 * over its bottom edge, so the conversation scrolls behind the composer and
 * fades out at the window's bottom. The footer's measured height is published
 * as `--chat-footer-height` for the viewport padding, fade, blur, and the
 * jump-to-latest button.
 */
export function ChatFooterSurface({
    children,
    className,
    footer,
}: {
    children: React.ReactNode;
    className?: string;
    footer: React.ReactNode;
}) {
    const surfaceRef = React.useRef<HTMLDivElement | null>(null);
    const footerRef = React.useRef<HTMLDivElement | null>(null);

    useChatFooterHeight(surfaceRef, footerRef);

    return (
        <div
            className={cn('chat-footer-surface relative min-h-0 flex-1', className)}
            ref={surfaceRef}
        >
            {children}
            <div className="chat-footer-dock" data-slot="chat-footer" ref={footerRef}>
                {footer}
            </div>
        </div>
    );
}

function useChatFooterHeight(
    surfaceRef: React.RefObject<HTMLDivElement | null>,
    footerRef: React.RefObject<HTMLDivElement | null>
) {
    React.useLayoutEffect(() => {
        const surface = surfaceRef.current;
        const footer = footerRef.current;

        if (!(surface && footer) || typeof ResizeObserver === 'undefined') {
            return;
        }

        let stack: Element | null = null;
        const publish = () => {
            // The composer stack rises out of the footer's box, so it is
            // observed on its own; it mounts and unmounts with the composer,
            // which always resizes the footer too.
            const nextStack = footer.querySelector('[data-slot="chat-composer-stack"]');
            if (nextStack !== stack) {
                if (stack) {
                    observer.unobserve(stack);
                }
                if (nextStack) {
                    observer.observe(nextStack);
                }
                stack = nextStack;
            }

            const box = footer.getBoundingClientRect();
            const clearance = chatFooterClearance({
                footerBottom: box.bottom,
                footerTop: box.top,
                stackTop: stack?.getBoundingClientRect().top,
            });
            surface.style.setProperty('--chat-footer-height', `${clearance}px`);
        };
        const observer = new ResizeObserver(publish);

        observer.observe(footer);
        publish();

        return () => {
            observer.disconnect();
            surface.style.removeProperty('--chat-footer-height');
        };
    }, [surfaceRef, footerRef]);
}
