import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RequireOperator } from '../../servers/require-operator.tsx';
import { useServerContext } from '../../servers/server-context.ts';
import { settingsConnectionRoute } from '../../servers/server-routes.ts';
import { SettingsPageColumn } from '../layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { ConnectionAddDrawer } from './connection-add-drawer.tsx';
import { ConnectionExploreDialog } from './connection-explore-dialog.tsx';
import { ConnectionListSection } from './connection-list-section.tsx';

type ConnectionsOverlay = 'add-custom' | 'explore' | null;

export function ConnectionsPage() {
    const { slug = '' } = useParams();
    const { server } = useServerContext();
    const [overlay, setOverlay] = React.useState<ConnectionsOverlay>(null);
    const navigate = useNavigate();

    return (
        <RequireOperator
            description="Connections are managed by Server operators."
            role={server.role}
        >
            <SettingsPageColumn>
                <SettingsPageHeader title="Connections" />
                <ConnectionListSection
                    onExplore={() => setOverlay('explore')}
                    onSelect={(connectionId) =>
                        navigate(settingsConnectionRoute(slug, connectionId))
                    }
                    serverId={server.id}
                />
                <ConnectionExploreDialog
                    onAddCustom={() => setOverlay('add-custom')}
                    onOpenChange={(open) => setOverlay(open ? 'explore' : null)}
                    open={overlay === 'explore'}
                    serverId={server.id}
                />
                <ConnectionAddDrawer
                    onOpenChange={(open) => setOverlay(open ? 'add-custom' : null)}
                    open={overlay === 'add-custom'}
                    serverId={server.id}
                />
            </SettingsPageColumn>
        </RequireOperator>
    );
}
