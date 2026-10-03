import { ItemCardGroup } from '@heroui-pro/react';
import type { ReactNode } from 'react';

/**
 * One section of a connection's page: a title on a hairline, an
 * optional muted count beside it, then the section's own content. The
 * `item-card-group--section` modifier in the theme layer sets the title flush
 * with the page column so every section starts on the header's edge.
 */
export function ConnectionSection({
    children,
    count,
    title,
    trailing,
}: {
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
                    {count !== undefined && count > 0 ? (
                        <span className="ms-2 font-normal text-muted tabular-nums">{count}</span>
                    ) : null}
                    {trailing}
                </ItemCardGroup.Title>
            </ItemCardGroup.Header>
            {children}
        </ItemCardGroup>
    );
}
