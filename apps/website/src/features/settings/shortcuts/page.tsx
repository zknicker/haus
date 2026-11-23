import { DataGrid, type DataGridColumn } from '@heroui-pro/react';
import { SearchField } from '@heroui/react';
import * as React from 'react';
import { isMacPlatform } from '../../../hooks/browser/browser-shortcut-keys.ts';
import { matchingShortcuts, type Shortcut } from '../../shortcuts/shortcut-registry.ts';
import { SettingsEmptyState } from '../layout/settings-empty.tsx';
import { SettingsPageColumn } from '../layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { ShortcutChords } from './shortcut-chord.tsx';

export function ShortcutsSettings() {
    const [query, setQuery] = React.useState('');
    const [isMac] = React.useState(isMacPlatform);
    const columns = React.useMemo(() => shortcutColumns(isMac), [isMac]);
    const rows = matchingShortcuts(query);

    return (
        <SettingsPageColumn width="table">
            <SettingsPageHeader title="Shortcuts" />
            <SearchField
                aria-label="Search shortcuts"
                className="w-64 max-w-full"
                onChange={setQuery}
                value={query}
            >
                <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input placeholder="Search shortcuts" />
                    <SearchField.ClearButton />
                </SearchField.Group>
            </SearchField>
            <DataGrid
                aria-label="Keyboard shortcuts"
                columns={columns}
                contentClassName="min-w-[560px]"
                data={rows}
                getRowId={(row) => row.id}
                renderEmptyState={() => (
                    <SettingsEmptyState role="status" title="No shortcuts match" />
                )}
            />
        </SettingsPageColumn>
    );
}

function shortcutColumns(isMac: boolean) {
    return [
        {
            cell: (shortcut) => (
                <span className="text-foreground font-medium">{shortcut.command}</span>
            ),
            header: 'Command',
            id: 'command',
            isRowHeader: true,
            minWidth: 200,
        },
        {
            cell: (shortcut) => <ShortcutChords chords={shortcut.chords} isMac={isMac} />,
            header: 'Shortcut',
            id: 'keys',
        },
        {
            cell: (shortcut) => <span className="text-muted">{shortcut.context}</span>,
            header: 'When',
            id: 'context',
        },
    ] satisfies DataGridColumn<Shortcut>[];
}
