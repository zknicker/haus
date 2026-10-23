import { Badge, Button, Tooltip } from '@heroui/react';
import { Sidebar } from '@heroui-pro/react';
import { ComputerIcon, PlusSignIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { cn } from '../../lib/utils.ts';
import { serverComputersRoute } from '../servers/server-routes.ts';
import { AddComputerDialog } from './add-computer-dialog.tsx';
import { computerDiskWarning } from './computer-disk.ts';
import { ComputerDiskChip } from './computer-disk-warning.tsx';
import { computerHealthColor, computerHealthLabel, computerLabel } from './presentation.ts';

/**
 * Settings-sidebar group listing every attached Computer as its own row.
 * Selecting a row opens the Computers settings section scoped to it.
 */
export function SettingsComputersGroup({
    currentSection,
    serverId,
    slug,
}: {
    currentSection: string | undefined;
    serverId: string;
    slug: string;
}) {
    const computers = useComputers(serverId);
    const [searchParams] = useSearchParams();
    const [adding, setAdding] = React.useState(false);
    const items = computers.data ?? [];
    const selectedId = searchParams.get('computer') ?? items[0]?.id;
    const route = serverComputersRoute(slug);

    return (
        <Sidebar.Group>
            <div className="flex w-full items-center justify-between">
                <Sidebar.GroupLabel>
                    Computers{computers.data ? ` · ${items.length}` : ''}
                </Sidebar.GroupLabel>
                <Tooltip delay={0}>
                    <Button
                        aria-label="Add Computer"
                        isIconOnly
                        onPress={() => setAdding(true)}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon aria-hidden="true" icon={PlusSignIcon} size={16} />
                    </Button>
                    <Tooltip.Content>Add Computer</Tooltip.Content>
                </Tooltip>
            </div>
            {!computers.data && computers.isPending ? (
                <div aria-busy="true">
                    <span className="sr-only">Loading Computers</span>
                </div>
            ) : computers.error && !computers.data ? (
                <p className="px-2 py-1 text-muted text-sm" role="alert">
                    Couldn’t load Computers
                </p>
            ) : items.length === 0 ? (
                <p className="px-2 py-1 text-muted text-sm">No Computers attached.</p>
            ) : (
                <Sidebar.Menu aria-label="Computers">
                    {items.map((computer) => (
                        <Sidebar.MenuItem
                            href={`${route}?computer=${computer.id}`}
                            id={computer.id}
                            isCurrent={currentSection === 'computers' && computer.id === selectedId}
                            key={computer.id}
                            textValue={computerLabel(computer)}
                        >
                            <Sidebar.MenuIcon>
                                <Badge.Anchor className="size-5 items-center justify-center">
                                    <Icon
                                        aria-hidden="true"
                                        className="text-muted"
                                        icon={ComputerIcon}
                                    />
                                    <Badge
                                        className={cn(
                                            'min-h-2.5 min-w-2.5',
                                            computer.health === 'offline' && 'bg-muted'
                                        )}
                                        color={computerHealthColor(computer.health)}
                                        placement="bottom-right"
                                        size="sm"
                                        title={computerHealthLabel(computer.health)}
                                    />
                                </Badge.Anchor>
                            </Sidebar.MenuIcon>
                            <Sidebar.MenuItemContent>
                                <Sidebar.MenuLabel>{computerLabel(computer)}</Sidebar.MenuLabel>
                                {computerDiskWarning(computer) ? (
                                    <ComputerDiskChip
                                        computerId={computer.id}
                                        serverId={serverId}
                                    />
                                ) : (
                                    <Sidebar.MenuChip>
                                        v{computer.productVersion ?? '—'}
                                    </Sidebar.MenuChip>
                                )}
                            </Sidebar.MenuItemContent>
                        </Sidebar.MenuItem>
                    ))}
                </Sidebar.Menu>
            )}
            <AddComputerDialog onOpenChange={setAdding} open={adding} serverSlug={slug} />
        </Sidebar.Group>
    );
}
