import { Button, Tooltip } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import { InformationCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import type React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';

/**
 * A settings row's title with its explanation behind an info tooltip — the
 * settings replacement for an `ItemCard.Description` paragraph, so a row that
 * needs explaining keeps the same title-only shape as its neighbors.
 */
export function SettingsRowTitle({ children, info }: { children: string; info: React.ReactNode }) {
    return (
        // ItemCard.Content is a column; the title and its info button share one line.
        <div className="flex items-center gap-0.5">
            <ItemCard.Title>{children}</ItemCard.Title>
            <Tooltip delay={0}>
                <Button aria-label={`About ${children}`} isIconOnly size="sm" variant="ghost">
                    <Icon aria-hidden="true" icon={InformationCircleIcon} size={14} />
                </Button>
                <Tooltip.Content>{info}</Tooltip.Content>
            </Tooltip>
        </div>
    );
}
