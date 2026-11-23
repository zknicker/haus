import { ItemCardGroup } from '@heroui-pro/react';
import type { ReactNode } from 'react';

/**
 * One section of a connection's page: an unruled title, an optional muted
 * count beside it (drawn as every settings section draws one), an optional
 * control at the header's trailing edge, then the section's own content. The
 * `item-card-group--section` modifier in the theme layer sets the title flush
 * with the page column so every section starts on the header's edge.
 */
export function ConnectionSection({
    action,
    children,
    count,
    title,
    trailing,
}: {
    /** The section's one control, such as its Add button. */
    action?: ReactNode;
    children: ReactNode;
    count?: number;
    title: string;
    /** A status beside the title, such as a refresh spinner. */
    trailing?: ReactNode;
}) {
    return (
        <ItemCardGroup className="item-card-group--section" variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>
                    {title}
                    {count === undefined ? null : (
                        // The leading space keeps "Tools 12" two words to
                        // assistive tech; the margin is the visual gap.
                        <span className="text-muted ms-2 tabular-nums">
                            <span className="sr-only"> </span>
                            {count}
                        </span>
                    )}
                    {trailing}
                </ItemCardGroup.Title>
                {action}
            </ItemCardGroup.Header>
            {children}
        </ItemCardGroup>
    );
}
