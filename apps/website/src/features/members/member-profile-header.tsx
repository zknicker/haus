import type React from 'react';

/**
 * One identity row, left-aligned: the mark, then a name line carrying the
 * record's badges, then one muted line with handle and description together.
 * The row's far end is a deliberate column — the labeled edit action over a
 * tertiary fact (`trailing`, a created date) — rather than a floating pencil
 * in the name line and a date adrift at the edge.
 */
export function MemberProfileHeader({
    action,
    avatar,
    badges,
    children,
    description,
    headingLevel = 1,
    name,
    subtitle,
    trailing,
}: {
    action?: React.ReactNode;
    avatar: React.ReactNode;
    badges?: React.ReactNode;
    children?: React.ReactNode;
    description?: React.ReactNode;
    /**
     * `2` where the page's shell band already states this record's name as the
     * page's `h1` — the Agent page, whose band carries the name and the tabs.
     * A profile under a band that only shows breadcrumbs keeps the default and
     * owns the page's one `h1`.
     */
    headingLevel?: 1 | 2;
    name: React.ReactNode;
    subtitle?: React.ReactNode;
    trailing?: React.ReactNode;
}) {
    const Heading = headingLevel === 1 ? 'h1' : 'h2';

    return (
        <header className="flex min-w-0 flex-col gap-4">
            <div className="flex min-w-0 items-center gap-4">
                {avatar}
                <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                        {/* A profile is a page, so its name takes the page
                            title step — `text-2xl` with tight tracking, the
                            same as `SettingsPageHeader`. At `text-xl` it
                            sat between the section headings below it and
                            the title every sibling settings page uses. */}
                        <Heading className="min-w-0 truncate font-semibold text-2xl text-foreground tracking-tight">
                            {name}
                        </Heading>
                        {badges}
                    </div>
                    {subtitle || description ? (
                        <p className="min-w-0 truncate text-muted text-sm">
                            {subtitle}
                            {subtitle && description ? ' · ' : null}
                            {description}
                        </p>
                    ) : null}
                </div>
                {action || trailing ? (
                    <div className="flex shrink-0 flex-col items-end gap-1.5 ps-4">
                        {action}
                        {trailing ? <span className="text-muted text-sm">{trailing}</span> : null}
                    </div>
                ) : null}
            </div>
            {children ? <div className="w-full min-w-0">{children}</div> : null}
        </header>
    );
}
