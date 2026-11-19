import { DataGrid, type DataGridColumn } from '@heroui-pro/react';
import { SearchField } from '@heroui/react';
import * as React from 'react';
import { isMacPlatform } from '../../../hooks/browser/browser-shortcut-keys.ts';
import { useIsDesktopApp } from '../../../hooks/shell/use-is-desktop-app.ts';
import { type Shortcut, visibleShortcuts } from '../../shortcuts/shortcut-registry.ts';
import { SettingsPageColumn } from '../layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { ShortcutChords } from './shortcut-chord.tsx';

export function ShortcutsSettings() {
    const desktop = useIsDesktopApp();
    const [query, setQuery] = React.useState('');
    const [isMac] = React.useState(isMacPlatform);
    const columns = React.useMemo(() => shortcutColumns(isMac), [isMac]);
    const rows = visibleShortcuts({ desktop, query });

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
                data={rows}
                getRowId={(row) => row.id}
                renderEmptyState={() => (
                    <p className="text-muted py-8 text-center text-sm">No shortcuts match.</p>
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
