import type React from 'react';
import { cn } from '../../../lib/utils.ts';

/**
 * The two text roles HeroUI's ItemCard has no slot for.
 *
 * Rows themselves are stock `ItemCard` — `.Title`, `.Description`, `.Action`.
 * These cover only what the component leaves to the product: the read-only
 * value a row reports, and the failure a row's action produced. Keep this file
 * at two text semantics; a row, a group, or a section belongs to
 * `ItemCardGroup`, not here.
 */

/**
 * A read-only value reported in a row's trailing slot. `className` carries the
 * value's own shape — a mono path, tabular digits, a truncation edge — never a
 * second text role.
 */
export function SettingsFact({
    children,
    className,
    title,
}: {
    children: React.ReactNode;
    className?: string;
    title?: string;
}) {
    return (
        <span className={cn('text-muted text-sm', className)} title={title}>
            {children}
        </span>
    );
}

/**
 * The failure a row's own action produced, announced under the description so
 * it reads with the control that caused it. Renders nothing when there is no
 * error, so call sites can pass a possibly-undefined message directly.
 */
export function SettingsRowError({ children }: { children?: React.ReactNode }) {
    if (!children) {
        return null;
    }

    return (
        <p className="mt-1 text-danger text-sm" role="alert">
            {children}
        </p>
    );
}
