import { EmptyState } from '@heroui-pro/react';
import { Button, Description, Dropdown, Label } from '@heroui/react';
import { ComputerIcon, MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useComputerStewards } from '../../hooks/computer-use/use-computer-stewards.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { serverComputersRoute } from '../servers/server-routes.ts';
import { PageTopbar } from '../shell/shell-topbar.tsx';
import { ComputerDetail } from './computer-detail.tsx';
import { ComputerProfilePending } from './computer-profile-pending.tsx';
import { computerRemovalDescription, useComputerRemovalAvailability } from './computer-removal.ts';
import { ComputerRemoveDialog } from './computer-remove-dialog.tsx';

export function ComputerPage({
    computerId,
    serverId,
    serverSlug,
}: {
    computerId: string;
    serverId: string;
    serverSlug: string;
}) {
    const computers = useComputers(serverId);
    const navigate = useNavigate();
    const [removing, setRemoving] = React.useState(false);
    const computer = computers.data?.find((item) => item.id === computerId);

    return (
        <div className="flex h-full min-h-0 w-full">
            {computer ? (
                <PageTopbar>
                    <ComputerBandMenu
                        computerId={computer.id}
                        onRemove={() => setRemoving(true)}
                        serverId={serverId}
                    />
                </PageTopbar>
            ) : null}
            <main className="min-w-0 flex-1 overflow-y-auto">
                {computers.error && !computers.data ? (
                    <ComputerUnavailable />
                ) : computers.data === undefined ? (
                    <ComputerProfilePending />
                ) : computer ? (
                    <ComputerDetail
                        computerId={computer.id}
                        onRemove={() => setRemoving(true)}
                        serverId={serverId}
                        serverSlug={serverSlug}
                    />
                ) : (
                    <ComputerNotFound computerId={computerId} serverId={serverId} />
                )}
            </main>
            {removing ? (
                <ComputerRemoveDialog
                    computerId={computerId}
                    onOpenChange={(open) => !open && setRemoving(false)}
                    onRemoved={() => navigate(serverComputersRoute(serverSlug), { replace: true })}
                    serverId={serverId}
                />
            ) : null}
        </div>
    );
}

/**
 * Removal is destructive, so it sits behind an overflow menu rather than as a
 * bare button in the band.
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
            <Button aria-label="Device actions" size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu>
                    {canRemove ? (
                        <Dropdown.Item
                            id="remove"
                            onAction={onRemove}
                            textValue="Remove device"
                            variant="danger"
                        >
                            <Label>Remove device</Label>
                        </Dropdown.Item>
                    ) : (
                        // A disabled item takes no pointer events, so its reason rides in the item.
                        <Dropdown.Item id="remove" isDisabled textValue="Remove device">
                            <Label>Remove device</Label>
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
                <h2 className="text-foreground text-sm font-medium">Devices unavailable</h2>
                <p className="text-muted mt-1 text-sm">Try opening this page again.</p>
            </div>
        </div>
    );
}

function ComputerNotFound({ computerId, serverId }: { computerId: string; serverId: string }) {
    const stewards = useComputerStewards(serverId, computerId);
    const steward = stewards.data;
    return (
        <div className="flex min-h-full items-center justify-center p-6">
            <EmptyState>
                <EmptyState.Header>
                    <EmptyState.Media variant="icon">
                        <Icon icon={ComputerIcon} />
                    </EmptyState.Media>
                    {steward ? (
                        <>
                            <EmptyState.Title>
                                {steward.name ?? 'This device'} isn’t yours to change
                            </EmptyState.Title>
                            <EmptyState.Description>
                                {steward.attacher.handle
                                    ? `@${steward.attacher.handle}`
                                    : steward.attacher.displayName}
                                , who attached it, or an Owner or Admin can change its settings,
                                including computer use.
                            </EmptyState.Description>
                        </>
                    ) : stewards.isPending ? null : (
                        <>
                            <EmptyState.Title>Device unavailable</EmptyState.Title>
                            <EmptyState.Description>
                                This device is no longer attached to the Server. Choose an attached
                                device from Devices; Haus will not redirect you to another machine.
                            </EmptyState.Description>
                        </>
                    )}
                </EmptyState.Header>
            </EmptyState>
        </div>
    );
}
