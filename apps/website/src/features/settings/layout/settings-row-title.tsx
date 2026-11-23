import { ItemCard } from '@heroui-pro/react';
import { Button, Chip, type ChipProps, Tooltip } from '@heroui/react';
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

/**
 * A settings row's title with the record's state beside it: the one place a
 * row shows status. `status` takes `SettingsStatusChip`s, so status never
 * moves into the row's action slot, a description, or a bare fact.
 */
export function SettingsStatusTitle({
    children,
    status,
}: {
    children: React.ReactNode;
    status: React.ReactNode;
}) {
    return (
        // ItemCard.Content is a column; the title keeps its truncation and the chips stay whole.
        <div className="flex min-w-0 items-center gap-2">
            <ItemCard.Title>{children}</ItemCard.Title>
            {status}
        </div>
    );
}

/** A status chip for `SettingsStatusTitle`: soft, `sm`, always labeled. */
export function SettingsStatusChip({
    children,
    color,
}: {
    children: React.ReactNode;
    color?: ChipProps['color'];
}) {
    return (
        <Chip className="shrink-0" color={color} size="sm" variant="soft">
            <Chip.Label>{children}</Chip.Label>
        </Chip>
    );
}
