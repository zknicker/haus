import { ItemCard } from '@heroui-pro/react';
import type * as React from 'react';
import { SettingsFact } from '../../settings/layout/settings-text.tsx';

/**
 * One fact about an Automation in its detail sheet: the name of the fact, and
 * its value as a muted settings fact that truncates rather than wrapping the
 * row. Reminders and Triggers share it so both sheets read as one system.
 */
export function AutomationFactRow({
    children,
    title,
}: {
    children: React.ReactNode;
    title: string;
}) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>{title}</ItemCard.Title>
            </ItemCard.Content>
            <ItemCard.Action className="min-w-0 shrink">
                <SettingsFact className="block truncate text-right tabular-nums">
                    {children}
                </SettingsFact>
            </ItemCard.Action>
        </ItemCard>
    );
}
