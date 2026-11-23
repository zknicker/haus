import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import type * as React from 'react';

/**
 * The one anatomy every Agent-profile list shares: a transparent group whose
 * header carries the title and its row count, wrapping the rows themselves.
 *
 * Rows arrive as children because each list owns its own row shape — the
 * duplication worth removing is the header, the count, and the clipped group,
 * not the rows.
 */
export function ProfileListSection({
    action,
    children,
    count,
    title,
}: {
    /** A control acting on the whole list, at the altitude it acts on. */
    action?: React.ReactNode;
    children: React.ReactNode;
    count: number | undefined;
    title: string;
}) {
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>
                    {title}
                    {count === undefined ? null : (
                        <span className="text-muted ms-2 tabular-nums">{count}</span>
                    )}
                </ItemCardGroup.Title>
                {action}
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">{children}</ItemCardGroup>
        </ItemCardGroup>
    );
}

/**
 * An empty list keeps its section header and says so in one quiet row, rather
 * than collapsing the section into a floating full-page empty state.
 */
function ProfileListSectionEmpty({ children }: { children: React.ReactNode }) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Description>{children}</ItemCard.Description>
            </ItemCard.Content>
        </ItemCard>
    );
}

ProfileListSection.Empty = ProfileListSectionEmpty;
