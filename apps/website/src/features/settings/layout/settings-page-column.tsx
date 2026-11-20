import type * as React from 'react';
import { cn } from '../../../lib/utils.ts';
import { PageColumn } from '../../shell/page-column.tsx';

const settingsColumnWidths = {
    form: 'max-w-153',
    table: 'max-w-212',
} as const;

export type SettingsColumnWidth = keyof typeof settingsColumnWidths;

export function SettingsPageColumn({
    className,
    width = 'form',
    ...props
}: React.ComponentProps<'div'> & { width?: SettingsColumnWidth }) {
    return (
        <PageColumn
            className={cn('box-content w-auto', settingsColumnWidths[width], className)}
            {...props}
        />
    );
}
