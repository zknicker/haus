import { Tooltip } from '@heroui/react';
import * as React from 'react';
import { cn } from '../../lib/utils.ts';

const viewportPadding = 12;

/**
 * The one hover-card material: always-dark glass with a compact inset, in
 * both app themes. `dark` scopes HeroUI's own dark tokens onto the card.
 */
export const hausHoverCardClassName = 'haus-hover-card dark';

interface CursorPositionInput {
    bounds: Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>;
    clientX: number;
    clientY: number;
}

export function CursorHoverCard({
    children,
    className,
    content,
    onOpenChange,
    triggerClassName,
}: {
    children: React.ReactNode;
    className?: string;
    content: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
    /**
     * Layout for the trigger wrapper itself. The wrapper is a real box in its
     * parent's layout, so a trigger inside a flex row needs `min-w-0` on it —
     * the class cannot reach from inside `children`.
     */
    triggerClassName?: string;
}) {
    const [open, setOpen] = React.useState(false);
    const contentRef = React.useRef<HTMLElement>(null);
    const pointerRef = React.useRef<CursorPositionInput | null>(null);
    const repositionFrameRef = React.useRef<number | null>(null);
    const triggerRef = React.useRef<HTMLSpanElement>(null);
    const offsetRef = React.useRef({ x: 0, y: 0 });

    const applyOffset = React.useCallback((x: number, y: number) => {
        offsetRef.current = { x, y };
        contentRef.current?.style.setProperty('--cursor-hover-x', `${x}px`);
        contentRef.current?.style.setProperty('--cursor-hover-y', `${y}px`);
    }, []);

    const applyPointerOffset = React.useCallback(
        (input: CursorPositionInput) => {
            const surface = contentRef.current?.getBoundingClientRect();
            const currentOffset = offsetRef.current;
            const offset = getCursorHoverOffset({
                ...input,
                surfaceBounds: surface
                    ? {
                          bottom: surface.bottom - currentOffset.y,
                          left: surface.left - currentOffset.x,
                          right: surface.right - currentOffset.x,
                          top: surface.top - currentOffset.y,
                      }
                    : undefined,
                viewport: surface
                    ? { height: window.innerHeight, width: window.innerWidth }
                    : undefined,
            });
            applyOffset(offset.x, offset.y);
        },
        [applyOffset]
    );
    const resetOffset = React.useCallback(() => {
        pointerRef.current = null;
        applyOffset(0, 0);
    }, [applyOffset]);
    const handlePointerMove = React.useCallback(
        (event: React.PointerEvent<HTMLSpanElement>) => {
            if (event.pointerType !== 'mouse') {
                resetOffset();
                return;
            }

            const bounds = triggerRef.current?.getBoundingClientRect();
            if (!bounds) {
                return;
            }

            const input = {
                bounds,
                clientX: event.clientX,
                clientY: event.clientY,
            } satisfies CursorPositionInput;
            pointerRef.current = input;
            applyPointerOffset(input);
        },
        [applyPointerOffset, resetOffset]
    );
    const handleOpenChange = React.useCallback(
        (open: boolean) => {
            setOpen(open);
            onOpenChange?.(open);
        },
        [onOpenChange]
    );

    return (
        <Tooltip closeDelay={0} delay={0} isOpen={open} onOpenChange={handleOpenChange}>
            <Tooltip.Trigger<'span'>
                className={cn('align-middle', triggerClassName)}
                onBlur={() => handleOpenChange(false)}
                onFocus={() => {
                    resetOffset();
                    handleOpenChange(true);
                }}
                onPointerMove={handlePointerMove}
                ref={triggerRef}
                render={(props) => <span {...props} />}
                role="presentation"
                tabIndex={-1}
            >
                {children}
            </Tooltip.Trigger>
            <Tooltip.Content
                className={cn(
                    'hover-card__content cursor-hover-card',
                    hausHoverCardClassName,
                    className
                )}
                offset={10}
                placement="bottom start"
                ref={(element) => {
                    if (repositionFrameRef.current !== null) {
                        window.cancelAnimationFrame(repositionFrameRef.current);
                        repositionFrameRef.current = null;
                    }
                    contentRef.current = element;
                    if (!element) {
                        return;
                    }
                    element.style.setProperty('--cursor-hover-x', `${offsetRef.current.x}px`);
                    element.style.setProperty('--cursor-hover-y', `${offsetRef.current.y}px`);
                    repositionFrameRef.current = window.requestAnimationFrame(() => {
                        repositionFrameRef.current = null;
                        const pointer = pointerRef.current;
                        if (pointer && contentRef.current === element) {
                            applyPointerOffset(pointer);
                        }
                    });
                }}
            >
                {content}
            </Tooltip.Content>
        </Tooltip>
    );
}

export function getCursorHoverOffset({
    bounds,
    clientX,
    clientY,
    surfaceBounds,
    viewport,
}: {
    bounds: CursorPositionInput['bounds'];
    clientX: CursorPositionInput['clientX'];
    clientY: CursorPositionInput['clientY'];
    surfaceBounds?: Pick<DOMRect, 'bottom' | 'left' | 'right' | 'top'>;
    viewport?: { height: number; width: number };
}) {
    let x = clientX + 15 - (surfaceBounds?.left ?? bounds.left);
    let y = clientY - 15 - (surfaceBounds?.bottom ?? bounds.top + bounds.height + 10);

    if (surfaceBounds && viewport) {
        x = constrainToViewport(x, {
            end: surfaceBounds.right,
            start: surfaceBounds.left,
            viewportSize: viewport.width,
        });
        y = constrainToViewport(y, {
            end: surfaceBounds.bottom,
            start: surfaceBounds.top,
            viewportSize: viewport.height,
        });
    }

    return { x: Math.round(x), y: Math.round(y) };
}

function constrainToViewport(
    value: number,
    {
        end,
        start,
        viewportSize,
    }: {
        end: number;
        start: number;
        viewportSize: number;
    }
) {
    const minimum = viewportPadding - start;
    const maximum = viewportSize - viewportPadding - end;
    if (minimum > maximum) {
        return (minimum + maximum) / 2;
    }
    return clamp(value, { maximum, minimum });
}

function clamp(value: number, bounds: { maximum: number; minimum: number }) {
    return Math.min(bounds.maximum, Math.max(bounds.minimum, value));
}
