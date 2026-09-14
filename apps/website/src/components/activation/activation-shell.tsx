import type * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils.ts';
import { useActivationSlots } from './activation-frame.tsx';

/** Portals keep each screen's query/auth context while the frame stays mounted. */
export function ActivationShell({
    children,
    end,
    mark,
    progress,
}: {
    children: React.ReactNode;
    end?: React.ReactNode;
    /** null hides the persistent brand while Cove leads the step. */
    mark?: React.ReactNode;
    progress?: React.ReactNode;
}) {
    const slots = useActivationSlots();
    return (
        <>
            {slots.content
                ? createPortal(
                      <div
                          className="activation-scene"
                          data-hide-mark={mark !== undefined || undefined}
                      >
                          {mark}
                          {children}
                      </div>,
                      slots.content
                  )
                : null}
            {slots.end ? createPortal(end, slots.end) : null}
            {slots.progress ? createPortal(progress, slots.progress) : null}
        </>
    );
}

/** One activation screen: centered heading, optional content, centered actions. */
export function ActivationStep({
    children,
    className,
    description,
    footer,
    title,
}: {
    children?: React.ReactNode;
    className?: string;
    description?: React.ReactNode;
    footer?: React.ReactNode;
    title: string;
}) {
    return (
        <section className={cn('activation-step', className)}>
            <header className="activation-step__heading">
                <h1 className="text-balance font-semibold text-2xl text-foreground tracking-tight">
                    {title}
                </h1>
                {description ? (
                    <p className="mx-auto max-w-sm text-pretty text-muted text-sm">{description}</p>
                ) : null}
            </header>
            {children ? <div className="activation-step__content">{children}</div> : null}
            {footer ? <footer className="activation-step__footer">{footer}</footer> : null}
        </section>
    );
}
