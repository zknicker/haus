import type { ComputerAgentAccessScope } from '@haus/api';
import { CellSwitch } from '@heroui-pro/react';
import { Button, Description, Label, ListBox, Popover, SearchField } from '@heroui/react';
import { useState } from 'react';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import {
    type AccessCaptain,
    type AgentAccessView,
    captainAccessLabel,
    captainChooserChange,
    captainChooserKeys,
    captainScopeRights,
} from './agent-access-model.ts';

export function CaptainChooser({
    canGrant,
    canRevoke,
    deviceKind,
    isPending,
    onChange,
    onScopeChange,
    scope,
    view,
}: {
    canGrant: boolean;
    canRevoke: boolean;
    deviceKind: string;
    isPending: boolean;
    onChange: (change: NonNullable<ReturnType<typeof captainChooserChange>>) => void;
    onScopeChange: (scope: ComputerAgentAccessScope) => void;
    scope: ComputerAgentAccessScope;
    view: AgentAccessView;
}) {
    const [query, setQuery] = useState('');
    const rights = captainScopeRights(scope, { canGrant, canRevoke });

    return (
        <Popover onOpenChange={(open) => (open ? setQuery('') : undefined)}>
            <Button isDisabled={!rights.steward} size="sm" variant="secondary">
                {captainAccessLabel(scope, view)}
            </Button>
            <Popover.Content offset={8} placement="bottom end">
                <Popover.Dialog aria-label="Captains">
                    <div className="flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2 p-2">
                        <CellSwitch
                            aria-label="All Captains on this Server"
                            isDisabled={!rights.canChange || isPending}
                            isSelected={scope === 'all'}
                            onChange={(all) => onScopeChange(all ? 'all' : 'selected')}
                        >
                            <CellSwitch.Trigger>
                                <CellSwitch.Label>All Captains on this Server</CellSwitch.Label>
                                <CellSwitch.Control />
                            </CellSwitch.Trigger>
                        </CellSwitch>
                        {scope === 'selected' ? (
                            <CaptainList
                                deviceKind={deviceKind}
                                disabledKeys={
                                    isPending
                                        ? null
                                        : captainChooserKeys(view, { canGrant, canRevoke }).disabled
                                }
                                onChange={onChange}
                                onQueryChange={setQuery}
                                query={query}
                                view={view}
                            />
                        ) : null}
                    </div>
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}

function CaptainList({
    deviceKind,
    disabledKeys,
    onChange,
    onQueryChange,
    query,
    view,
}: {
    deviceKind: string;
    disabledKeys: readonly string[] | null;
    onChange: (change: NonNullable<ReturnType<typeof captainChooserChange>>) => void;
    onQueryChange: (query: string) => void;
    query: string;
    view: AgentAccessView;
}) {
    const needle = query.trim().toLowerCase();
    const captains = [...view.machine, ...view.granted, ...view.others].filter((captain) =>
        captain.displayName.toLowerCase().includes(needle)
    );
    const machineIds = new Set(view.machine.map((captain) => captain.id));
    return (
        <>
            <SearchField
                aria-label="Search Captains"
                autoFocus
                fullWidth
                name="captain-search"
                onChange={onQueryChange}
                value={query}
                variant="secondary"
            >
                <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input placeholder="Search Captains" />
                    <SearchField.ClearButton />
                </SearchField.Group>
            </SearchField>
            <ListBox
                aria-label="Captains with access"
                escapeKeyBehavior="none"
                className="max-h-[min(20rem,calc(100dvh-14rem))] overflow-y-auto"
                disabledKeys={disabledKeys ?? captains.map(({ id }) => id)}
                onSelectionChange={(next) => {
                    const change = captainChooserChange(
                        view,
                        new Set(next === 'all' ? [] : [...next].map(String))
                    );
                    if (change) {
                        onChange(change);
                    }
                }}
                renderEmptyState={() => (
                    <p className="text-muted py-6 text-center text-sm">No matches</p>
                )}
                selectedKeys={[...view.machine, ...view.granted].map((captain) => captain.id)}
                selectionMode="multiple"
            >
                {captains.map((captain) => (
                    <CaptainOption
                        captain={captain}
                        key={captain.id}
                        usesByDefault={
                            machineIds.has(captain.id) ? `Uses this ${deviceKind} by default` : null
                        }
                    />
                ))}
            </ListBox>
        </>
    );
}

function CaptainOption({
    captain,
    usesByDefault,
}: {
    captain: AccessCaptain;
    usesByDefault: string | null;
}) {
    return (
        <ListBox.Item id={captain.id} textValue={captain.displayName}>
            <EntityAvatar name={captain.displayName} size={20} src={captain.avatarUrl} />
            <div className="flex min-w-0 flex-col">
                <Label>{captain.displayName}</Label>
                {usesByDefault ? <Description>{usesByDefault}</Description> : null}
            </div>
            <ListBox.ItemIndicator />
        </ListBox.Item>
    );
}
