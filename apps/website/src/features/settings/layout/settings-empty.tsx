import { EmptyState, ItemCard } from '@heroui-pro/react';
import type { IconSvgElement } from '@hugeicons/react';
import type * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';

export function SettingsEmptyState({
    action,
    description,
    icon,
    role,
    title,
}: {
    action?: React.ReactNode;
    description?: React.ReactNode;
    icon?: IconSvgElement;

    role?: 'status';
    title: React.ReactNode;
}) {
    return (
        <EmptyState role={role} size="md">
            <EmptyState.Header>
                {icon ? (
                    <EmptyState.Media variant="icon">
                        <Icon icon={icon} />
                    </EmptyState.Media>
                ) : null}
                <EmptyState.Title>{title}</EmptyState.Title>
                {description ? (
                    <EmptyState.Description>{description}</EmptyState.Description>
                ) : null}
            </EmptyState.Header>
            {action ? <EmptyState.Content>{action}</EmptyState.Content> : null}
        </EmptyState>
    );
}

export function SettingsEmptyRow({ children }: { children: React.ReactNode }) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Description>{children}</ItemCard.Description>
            </ItemCard.Content>
        </ItemCard>
    );
}
