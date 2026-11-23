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
 * A settings page's identity is its title. A sentence under it explaining what
 * the page is repeated the nav label it was opened from, so pages carry none;
 * guidance a reader genuinely needs goes in `info`, an info tooltip beside the
 * title that stays outside the heading so its accessible name is the title
 * alone. Page-level actions do not belong here — they go in the shell band
 * through `PageTopbar`, which is otherwise empty on settings routes.
 *
 * - No inline padding: the title, section headings, page-level search fields,
 *   tables and card edges share the column's left edge. Row text keeps its
 *   inset inside the card. The theme flushes settings section headers to match
 *   (`.settings-frame` in `default-theme.css`).
 * - Semibold with tight tracking, not bold. Inter at 22px/700 with default
 *   tracking is the browser's idea of a heading, not a designed one.
 *
 * `meta` is for a page about one record: the facts that identify it. A
 * Computer's system, version, and last contact say more than any sentence
 * about Computers could, and they change.
 *
 * `aside` is the same record's *tabular* facts — a `ProfileFacts` list — set at
 * the far end of the title line instead of stacked under it. It is still not
 * an action slot: a control goes in the shell band, a section header, or a
 * row. The header is a wrapping row, so once the reading column is too narrow
 * the facts drop to their own line and stay left-aligned there.
 *
 * `meta` is a band of chips whose own boxes already carry padding, and sits
 * under a `text-2xl` whose 32px line box adds 4px of half-leading below the
 * glyphs — so the gap is 4px and the title takes `leading-7`, which trims the
 * half-leading rather than the gap.
 */
export function SettingsPageHeader({
    aside,
    className,
    info,
    meta,
    title,
    ...props
}: Omit<React.ComponentProps<'header'>, 'title'> & {
    aside?: React.ReactNode;
    info?: React.ReactNode;
    meta?: React.ReactNode;
    title: React.ReactNode;
}) {
    return (
        <header
            className={cn(
                'flex min-w-0 flex-wrap items-end justify-between gap-x-8 gap-y-3',
                className
            )}
            {...props}
        >
            <div className="min-w-0">
                <div className="flex items-center gap-1">
                    <h1
                        className={cn(
                            'text-foreground text-2xl font-semibold tracking-tight',
                            meta ? 'leading-7' : undefined
                        )}
                    >
                        {title}
                    </h1>
                    {info}
                </div>
                {meta ? <div className="mt-1">{meta}</div> : null}
            </div>
            {aside}
        </header>
    );
}
