import { Button } from '@heroui/react';
import { ItemCardGroup } from '@heroui-pro/react';
import * as React from 'react';
import { useServerList } from '../../../hooks/servers/use-server-list.ts';
import type { ServerSummary } from '../../../lib/haus-server.tsx';
import { CreateServerDialog } from '../../servers/create-server-dialog.tsx';
import { JoinServerDialog } from '../../servers/join-server-dialog.tsx';
import { PageColumn } from '../../shell/page-column.tsx';
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
        <PageColumn>
            <SettingsPageHeader
                description="The Servers you belong to. Open another, or start one of your own."
                title="Servers"
            />
            <ItemCardGroup variant="transparent">
                {/* Creating and joining both add a row to this list, so the
                    controls belong to the section rather than the page. */}
                <ItemCardGroup.Header className="flex flex-wrap items-center justify-between gap-3">
                    <ItemCardGroup.Title>Your Servers</ItemCardGroup.Title>
                    <div className="flex items-center gap-2">
                        <Button onPress={() => setDialog('join')} size="sm" variant="secondary">
                            Join a Server
                        </Button>
                        <Button onPress={() => setDialog('create')} size="sm" variant="secondary">
                            Create a Server
                        </Button>
                    </div>
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
        </PageColumn>
    );
}
