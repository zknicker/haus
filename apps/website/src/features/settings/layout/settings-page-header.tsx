import type React from 'react';
import { cn } from '../../../lib/utils.ts';

/**
 * The one thing settings composition still owns: a page's identity.
 *
 * Sections and rows are stock `ItemCardGroup`/`ItemCard`. The local
 * `SettingsSection`/`SettingsGroup`/`SettingsItem` kit that used to live beside
 * this is gone — it was a parallel implementation of those parts that drifted
 * on heading size, row padding, and left edge. Do not reintroduce one.
 *
 * A settings page's identity: title and description. Page-level actions do not
 * belong here — they go in the shell band through `PageTopbar`, which is
 * otherwise empty on settings routes.
 *
 * Three details carry the whole block, and all three were wrong:
 *
 * - `px-4` puts the title on the same left edge as `ItemCardGroup`'s own header
 *   and row text below it. At `px-1` the page title sat 12px inside everything
 *   it headed, so the column had two left edges.
 * - Semibold with tight tracking, not bold. Inter at 22px/700 with default
 *   tracking is the browser's idea of a heading, not a designed one.
 * - The description is body copy: the same `text-sm` step as every row title,
 *   row description, and table cell under it, on its natural leading. It was
 *   `leading-tight`, which reads as a caption on one line and collapses into a
 *   block when it wraps. Stepping it up to `text-base` instead made it the
 *   largest thing on the page after the title, which is not what a subtitle is
 *   for — the space above and below it does that work.
 *
 * `meta` is the alternative to `description` for a page about one record: the
 * facts that identify it, rather than a sentence explaining what the page is.
 * A Computer's system, version, and last contact say more than any sentence
 * about Computers could, and they change — a static line does not. Prose in
 * `description`, structured facts in `meta`; a page rarely wants both.
 *
 * `aside` is the same record's *tabular* facts — a `ProfileFacts` list — set at
 * the far end of the title line instead of stacked under it. Values that short
 * read as a caption band beside the name, not as a third paragraph below it.
 * It is still not an action slot: a control goes in the shell band, a section
 * header, or a row. The header is a wrapping row, so once the reading column is
 * too narrow the facts drop to their own line and stay left-aligned there.
 *
 * The title's rhythm is set per slot rather than as one `space-y`, because the
 * two slots are not the same kind of neighbour. `description` is body copy
 * continuing the title's paragraph, and keeps the 6px it has always had.
 * `meta` is a band of chips whose own boxes already carry padding, and sits
 * under a `text-2xl` whose 32px line box adds 4px of half-leading below the
 * glyphs — so at the same 6px it read as detached from the name it describes.
 * In that case only, the gap drops to 4px and the title takes `leading-7`,
 * which trims the half-leading rather than the gap and leaves the identity
 * block short enough to share a band with `aside`. Pages that pass only a
 * description are byte-identical to before.
 */
export function SettingsPageHeader({
    aside,
    className,
    description,
    meta,
    title,
    ...props
}: Omit<React.ComponentProps<'header'>, 'title'> & {
    aside?: React.ReactNode;
    description?: React.ReactNode;
    meta?: React.ReactNode;
    title: React.ReactNode;
}) {
    return (
        <header
            className={cn(
                'flex min-w-0 flex-wrap items-end justify-between gap-x-8 gap-y-3 px-4',
                className
            )}
            {...props}
        >
            <div className="min-w-0">
                <h1
                    className={cn(
                        'font-semibold text-2xl text-foreground tracking-tight',
                        meta ? 'leading-7' : undefined
                    )}
                >
                    {title}
                </h1>
                {description ? <p className="mt-1.5 text-muted text-sm">{description}</p> : null}
                {meta ? <div className="mt-1">{meta}</div> : null}
            </div>
            {aside}
        </header>
    );
}
