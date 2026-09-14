import type React from 'react';
import { cn } from '../../lib/utils.ts';

/**
 * The durable facts that identify one record, under its name: a person's role,
 * email, and join date; a Computer's version, last contact, and added date.
 *
 * Value over label, because the value is what a reader came for — the label is
 * only there to say what they are looking at. That is why the DOM order is the
 * semantic one (`dt` then `dd`, so a screen reader hears the pairing) and the
 * visual order is flipped with `order`, rather than writing the list upside
 * down. A run of these reads as a row of values with captions, not as a
 * paragraph of "label: value" clauses.
 *
 * The run aligns on its captions (`items-end`), not on the tops of its values.
 * One fact's value can be a control — a Role `Chip` is half again as tall as a
 * line of text — and top-aligned that pushes its caption below every other
 * caption, so the row reads as three loose stacks instead of one band. Ending
 * them lines the captions up and leaves the taller value to rise out of the
 * row, which is what a control should do.
 */
export function ProfileFacts({ children }: { children: React.ReactNode }) {
    return <dl className="flex min-w-0 flex-wrap items-end gap-x-8 gap-y-3 text-sm">{children}</dl>;
}

export function ProfileFact({
    className,
    label,
    value,
}: {
    /** Layout or numeral treatment for the value only, such as `tabular-nums`. */
    className?: string;
    label: React.ReactNode;
    value: React.ReactNode;
}) {
    return (
        // A value and its caption are one unit, so they sit on their own
        // leading with a hairline between them. They were a 4px gap under a
        // 24px-tall value box, which put more air inside the pair than the
        // `gap-y` between two stacked rows of them — the caption read as a
        // separate line rather than as this value's label.
        <div className="flex min-w-0 flex-col items-start gap-0.5 text-start leading-5">
            <dt className="order-2 truncate font-medium text-muted">{label}</dt>
            <dd
                className={cn(
                    'order-1 flex min-w-0 items-center truncate font-semibold text-foreground',
                    className
                )}
            >
                {value}
            </dd>
        </div>
    );
}
