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
            <SettingsInfo label={`About ${children}`}>{info}</SettingsInfo>
        </div>
    );
}

/**
 * A settings row's title with the record's state beside it: the one place a
 * row shows status. `status` takes `SettingsStatusChip`s, so status never
 * moves into the row's action slot, a description, or a bare fact. `info`
 * explains the state behind an info tooltip, as `SettingsRowTitle` does, so
 * the row stays title-only; `infoLabel` names it when the title is not text.
 */
export function SettingsStatusTitle({
    children,
    info,
    infoLabel,
    status,
}: {
    children: React.ReactNode;
    info?: React.ReactNode;
    infoLabel?: string;
    status: React.ReactNode;
}) {
    return (
        // ItemCard.Content is a column; the title keeps its truncation and the chips stay whole.
        <div className="flex min-w-0 items-center gap-2">
            {info ? (
                <div className="flex min-w-0 items-center gap-0.5">
                    <ItemCard.Title>{children}</ItemCard.Title>
                    <SettingsInfo
                        label={
                            infoLabel ?? `About ${typeof children === 'string' ? children : 'this'}`
                        }
                    >
                        {info}
                    </SettingsInfo>
                </div>
            ) : (
                <ItemCard.Title>{children}</ItemCard.Title>
            )}
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

/**
 * The info button behind every settings explanation: a ghost `sm` icon button
 * with a 16px glyph, its text in a tooltip. Rows reach it through
 * `SettingsRowTitle` and `SettingsStatusTitle`; a page passes it to
 * `SettingsPageHeader`'s `info`.
 */
export function SettingsInfo({ children, label }: { children: React.ReactNode; label: string }) {
    return (
        <Tooltip delay={0}>
            <Button aria-label={label} isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={InformationCircleIcon} size={16} />
            </Button>
            <Tooltip.Content>{children}</Tooltip.Content>
        </Tooltip>
    );
}
