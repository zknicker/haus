import { Alert, Chip, SearchField } from '@heroui/react';
import { DataGrid, type DataGridColumn, ItemCardGroup } from '@heroui-pro/react';
import * as React from 'react';
import { useComputers } from '../../../hooks/servers/use-computers.ts';
import { PageColumn } from '../../shell/page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { CloudAgentModelGroup } from './cloud-agent-model-group.tsx';
import {
    buildModelCatalog,
    buildRuntimeAccess,
    type ModelCatalogItem,
    type ModelsComputer,
} from './model-catalog.ts';

interface RuntimeRow {
    computer: string;
    id: string;
    label: string;
    models: string;
}

export function ModelsSettings({ canManage, serverId }: { canManage: boolean; serverId: string }) {
    const computers = useComputers(serverId);
    const [query, setQuery] = React.useState('');
    const items: ModelsComputer[] = computers.data ?? [];
    const runtimeRows = runtimeAccessRows(items);
    const normalizedQuery = query.trim().toLowerCase();
    const models = buildModelCatalog(items).filter(
        (model) =>
            !normalizedQuery ||
            model.label.toLowerCase().includes(normalizedQuery) ||
            model.id.toLowerCase().includes(normalizedQuery) ||
            model.runtimes.some((runtime) => runtime.toLowerCase().includes(normalizedQuery))
    );

    if (computers.error && !computers.data) {
        return (
            <PageColumn>
                <SettingsPageHeader
                    description="Models reported by runtimes detected on your Computers."
                    title="Models"
                />
                {/* The model is a Server setting every member reads, even one
                    who cannot see the Computers that report runtimes. */}
                <CloudAgentModelGroup canManage={canManage} serverId={serverId} />
                <Alert role="alert" status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                        <Alert.Title>Computer inventory unavailable</Alert.Title>
                        <Alert.Description>{computers.error.message}</Alert.Description>
                    </Alert.Content>
                </Alert>
            </PageColumn>
        );
    }

    return (
        <PageColumn>
            <SettingsPageHeader
                description="Models reported by runtimes detected on your Computers."
                title="Models"
            />

            <CloudAgentModelGroup canManage={canManage} serverId={serverId} />

            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Detected Runtimes</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                {!computers.data && computers.isPending ? (
                    <PendingRows label="Loading detected runtimes" />
                ) : runtimeRows.length > 0 ? (
                    <DataGrid
                        aria-label="Detected runtimes"
                        columns={runtimeColumns}
                        data={runtimeRows}
                        getRowId={(item) => item.id}
                    />
                ) : (
                    <p className="text-muted text-sm">
                        No runtimes detected. Attach a Computer with a detected runtime.
                    </p>
                )}
            </ItemCardGroup>

            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header className="flex flex-wrap items-center justify-between gap-3">
                    <ItemCardGroup.Title>
                        Reported Models
                        {computers.data ? (
                            <span className="ms-2 text-muted tabular-nums">{models.length}</span>
                        ) : null}
                    </ItemCardGroup.Title>
                    {/* Scoped to this section, so it rides in the section header
                        rather than spanning the page the way a page control would. */}
                    <SearchField
                        aria-label="Search models"
                        className="w-56 max-w-full"
                        onChange={setQuery}
                        value={query}
                    >
                        <SearchField.Group>
                            <SearchField.SearchIcon />
                            <SearchField.Input placeholder="Search models..." />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                </ItemCardGroup.Header>
                {!computers.data && computers.isPending ? (
                    <PendingRows label="Loading reported models" />
                ) : models.length > 0 ? (
                    <DataGrid
                        aria-label="Reported models"
                        columns={modelColumns}
                        data={models}
                        getRowId={(item) => item.id}
                    />
                ) : (
                    <p className="py-8 text-center text-muted text-sm">
                        {query ? 'No models match your search.' : 'No models reported yet.'}
                    </p>
                )}
            </ItemCardGroup>
        </PageColumn>
    );
}

/** Blank while loading — the app shows no skeletons on synced surfaces. */
function PendingRows({ label }: { label: string }) {
    return (
        <div aria-busy="true" className="min-h-24">
            <span className="sr-only">{label}</span>
        </div>
    );
}

function runtimeAccessRows(computers: ModelsComputer[]): RuntimeRow[] {
    return buildRuntimeAccess(computers).map(({ computer, computerId, runtime }) => ({
        computer,
        id: `${computerId}:${runtime.id}`,
        label: runtime.label,
        models: runtime.models.map((model) => model.label).join(', ') || 'No models reported',
    }));
}

const runtimeColumns: DataGridColumn<RuntimeRow>[] = [
    {
        accessorKey: 'label',
        allowsSorting: true,
        header: 'Runtime',
        id: 'label',
        isRowHeader: true,
        minWidth: 140,
    },
    {
        accessorKey: 'computer',
        allowsSorting: true,
        cellClassName: 'text-muted',
        header: 'Computer',
        id: 'computer',
        minWidth: 160,
    },
    {
        accessorKey: 'models',
        cellClassName: 'text-muted',
        header: 'Models',
        id: 'models',
        minWidth: 220,
    },
    {
        align: 'end',
        cell: () => (
            <Chip color="success" size="sm" variant="soft">
                Detected
            </Chip>
        ),
        header: 'Status',
        id: 'status',
        minWidth: 100,
    },
];

const modelColumns: DataGridColumn<ModelCatalogItem>[] = [
    {
        accessorKey: 'label',
        allowsSorting: true,
        header: 'Model',
        id: 'label',
        isRowHeader: true,
        minWidth: 180,
        sortFn: (a, b) => a.label.localeCompare(b.label),
    },
    {
        allowsSorting: true,
        cell: (item) => <span className="font-mono text-muted">{item.id}</span>,
        header: 'Identifier',
        id: 'id',
        minWidth: 180,
        sortFn: (a, b) => a.id.localeCompare(b.id),
    },
    {
        cell: (item) => (
            <div className="flex flex-wrap gap-1.5">
                {item.runtimes.map((runtime) => (
                    <Chip key={runtime} size="sm" variant="secondary">
                        {runtime}
                    </Chip>
                ))}
            </div>
        ),
        header: 'Runtimes',
        id: 'runtimes',
        minWidth: 160,
    },
    {
        accessorKey: 'computerCount',
        align: 'end',
        allowsSorting: true,
        cellClassName: 'text-muted tabular-nums',
        header: 'Computers',
        id: 'computerCount',
        minWidth: 110,
    },
];
