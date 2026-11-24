import { ItemCardGroup } from '@heroui-pro/react';
import { Button, Dropdown, Label } from '@heroui/react';
import * as React from 'react';
import { useServerList } from '../../../hooks/servers/use-server-list.ts';
import type { ServerSummary } from '../../../lib/haus-server.tsx';
import { CreateServerDialog } from '../../servers/create-server-dialog.tsx';
import { JoinServerDialog } from '../../servers/join-server-dialog.tsx';
import { SettingsPageColumn } from '../layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { ServerList } from './server-list.tsx';

/**
 * Which Servers you belong to, and the way into another one.
 *
 * Switching, creating, and joining are rare, so they are a settings
 * destination rather than the sidebar's top-left corner. The page owns the two
 * dialogs itself: nothing above it holds that state any more.
 */
export function ServersSettings() {
    const servers = useServerList();

    return <ServersSettingsView servers={servers.data} />;
}

export function ServersSettingsView({ servers }: { servers: ServerSummary[] | undefined }) {
    const [dialog, setDialog] = React.useState<'create' | 'join' | null>(null);

    return (
        <SettingsPageColumn>
            <SettingsPageHeader title="Servers" />
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Your Servers</ItemCardGroup.Title>
                    <AddServerMenu onChoose={setDialog} />
                </ItemCardGroup.Header>
                {servers ? <ServerList servers={servers} /> : null}
            </ItemCardGroup>
            <CreateServerDialog
                isOpen={dialog === 'create'}
                onOpenChange={(isOpen) => setDialog(isOpen ? 'create' : null)}
            />
            <JoinServerDialog
                isOpen={dialog === 'join'}
                onOpenChange={(isOpen) => setDialog(isOpen ? 'join' : null)}
            />
        </SettingsPageColumn>
    );
}

function AddServerMenu({ onChoose }: { onChoose: (dialog: 'create' | 'join') => void }) {
    return (
        <Dropdown>
            <Button size="sm" variant="secondary">
                Add Server
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu onAction={(key) => onChoose(key === 'join' ? 'join' : 'create')}>
                    <Dropdown.Item id="create" textValue="Create a Server">
                        <Label>Create a Server</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="join" textValue="Join a Server">
                        <Label>Join a Server</Label>
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
