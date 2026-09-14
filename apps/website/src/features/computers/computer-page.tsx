import { Button, Description, Dropdown, Label } from '@heroui/react';
import { EmptyState } from '@heroui-pro/react';
import { ComputerIcon, MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { PageTopbar } from '../shell/shell-topbar.tsx';
import { AddComputerDialog } from './add-computer-dialog.tsx';
import { ComputerDetail } from './computer-detail.tsx';
import { resolveComputerPageState } from './computer-page-state.ts';
import { ComputerProfilePending } from './computer-profile-pending.tsx';
import { computerRemovalDescription, useComputerRemovalAvailability } from './computer-removal.ts';
import { ComputerRemoveDialog } from './computer-remove-dialog.tsx';

export function ComputerPage({ serverId, serverSlug }: { serverId: string; serverSlug: string }) {
    const computers = useComputers(serverId);
    const [searchParams] = useSearchParams();
    const [adding, setAdding] = React.useState(false);
    const [removingId, setRemovingId] = React.useState<string | null>(null);
    const state = resolveComputerPageState({
        computers: computers.data,
        requestedId: searchParams.get('computer'),
    });

    // The Computer in view names itself in the content column through
    // SettingsPageHeader, the way every settings destination does; the band is
    // left to this page's actions.
    const selected =
        state.status === 'ready'
            ? computers.data?.find((item) => item.id === state.computerId)
            : undefined;

    return (
        <div className="flex h-full min-h-0 w-full">
            {selected ? (
                <PageTopbar>
                    <ComputerBandMenu
                        computerId={selected.id}
                        onRemove={() => setRemovingId(selected.id)}
                        serverId={serverId}
                    />
                </PageTopbar>
            ) : null}
            <main className="min-w-0 flex-1 overflow-y-auto">
                {computers.error && !computers.data ? (
                    <ComputerUnavailable />
                ) : state.status === 'loading' ? (
                    <ComputerProfilePending />
                ) : state.status === 'ready' ? (
                    <ComputerDetail
                        computerId={state.computerId}
                        onRemove={() => setRemovingId(state.computerId)}
                        serverId={serverId}
                        serverSlug={serverSlug}
                    />
                ) : state.status === 'not-found' ? (
                    <ComputerNotFound />
                ) : (
                    <ComputerEmpty onAdd={() => setAdding(true)} />
                )}
            </main>
            <AddComputerDialog onOpenChange={setAdding} open={adding} serverSlug={serverSlug} />
            {removingId ? (
                <ComputerRemoveDialog
                    computerId={removingId}
                    onOpenChange={(open) => !open && setRemovingId(null)}
                    serverId={serverId}
                />
            ) : null}
        </div>
    );
}

/**
 * Page-level actions for the Computer in view. Removal is destructive, so it sits
 * behind an overflow menu rather than as a bare button in the band; the update
 * card keeps its own check and install controls, which belong to that card's state.
 */
function ComputerBandMenu({
    computerId,
    onRemove,
    serverId,
}: {
    computerId: string;
    onRemove: () => void;
    serverId: string;
}) {
    const availability = useComputerRemovalAvailability(serverId, computerId);
    const canRemove = availability.status === 'ready';

    return (
        <Dropdown>
            <Button aria-label="Computer actions" size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu>
                    {canRemove ? (
                        <Dropdown.Item
                            id="remove"
                            onAction={onRemove}
                            textValue="Remove Computer"
                            variant="danger"
                        >
                            <Label>Remove Computer</Label>
                        </Dropdown.Item>
                    ) : (
                        // A disabled menu item takes no pointer events, so a tooltip
                        // here would never fire and the reason would be unreachable.
                        // The blocking reason rides in the item itself instead.
                        <Dropdown.Item id="remove" isDisabled textValue="Remove Computer">
                            <Label>Remove Computer</Label>
                            <Description>{computerRemovalDescription(availability)}</Description>
                        </Dropdown.Item>
                    )}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

function ComputerUnavailable() {
    return (
        <div className="flex min-h-full items-center justify-center p-6 text-center">
            <div>
                <h2 className="font-medium text-foreground text-sm">Computers unavailable</h2>
                <p className="mt-1 text-muted text-sm">Try opening this page again.</p>
            </div>
        </div>
    );
}

function ComputerEmpty({ onAdd }: { onAdd: () => void }) {
    return (
        <div className="flex min-h-full items-center justify-center p-6">
            <EmptyState>
                <EmptyState.Header>
                    <EmptyState.Media variant="icon">
                        <Icon icon={ComputerIcon} />
                    </EmptyState.Media>
                    <EmptyState.Title>Attach a Computer</EmptyState.Title>
                    <EmptyState.Description>
                        Computers run Agents and keep their workspaces, runtime access, and
                        execution state on your machine.
                    </EmptyState.Description>
                </EmptyState.Header>
                <EmptyState.Content>
                    <Button onPress={onAdd}>Add Computer</Button>
                </EmptyState.Content>
            </EmptyState>
        </div>
    );
}

function ComputerNotFound() {
    return (
        <div className="flex min-h-full items-center justify-center p-6">
            <EmptyState>
                <EmptyState.Header>
                    <EmptyState.Media variant="icon">
                        <Icon icon={ComputerIcon} />
                    </EmptyState.Media>
                    <EmptyState.Title>Computer unavailable</EmptyState.Title>
                    <EmptyState.Description>
                        This Computer is no longer attached to the Server. Choose an attached
                        Computer from the list; Haus will not redirect you to another machine.
                    </EmptyState.Description>
                </EmptyState.Header>
            </EmptyState>
        </div>
    );
}
