import { Button, Description, Label, ListBox, Popover, SearchField } from '@heroui/react';
import { useState } from 'react';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import {
    type AccessCaptain,
    type AgentAccessView,
    captainChooserChange,
    captainChooserKeys,
} from './agent-access-model.ts';

export function CaptainChooser({
    canGrant,
    canRevoke,
    deviceKind,
    isPending,
    onChange,
    view,
}: {
    canGrant: boolean;
    canRevoke: boolean;
    deviceKind: string;
    isPending: boolean;
    onChange: (change: NonNullable<ReturnType<typeof captainChooserChange>>) => void;
    view: AgentAccessView;
}) {
    const [query, setQuery] = useState('');
    const keys = captainChooserKeys(view, { canGrant, canRevoke });
    const needle = query.trim().toLowerCase();
    const captains = [...view.machine, ...view.granted, ...view.others].filter((captain) =>
        captain.displayName.toLowerCase().includes(needle)
    );
    const machineIds = new Set(view.machine.map((captain) => captain.id));

    return (
        <Popover onOpenChange={(open) => (open ? setQuery('') : undefined)}>
            <Button size="sm" variant="secondary">
                Choose Captains
            </Button>
            <Popover.Content offset={8} placement="bottom end">
                <Popover.Dialog aria-label="Choose Captains">
                    <div className="flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2 p-2">
                        <SearchField
                            aria-label="Search Captains"
                            autoFocus
                            fullWidth
                            name="captain-search"
                            onChange={setQuery}
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
                            className="max-h-[min(20rem,calc(100dvh-12rem))] overflow-y-auto"
                            disabledKeys={isPending ? captains.map(({ id }) => id) : keys.disabled}
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
                            selectedKeys={keys.selected}
                            selectionMode="multiple"
                        >
                            {captains.map((captain) => (
                                <CaptainOption
                                    captain={captain}
                                    key={captain.id}
                                    usesByDefault={
                                        machineIds.has(captain.id)
                                            ? `Uses this ${deviceKind} by default`
                                            : null
                                    }
                                />
                            ))}
                        </ListBox>
                    </div>
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
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
