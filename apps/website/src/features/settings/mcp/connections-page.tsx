import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { RequireOperator } from '../../servers/require-operator.tsx';
import { useServerContext } from '../../servers/server-context.ts';
import { serverRoute, settingsConnectionRoute } from '../../servers/server-routes.ts';
import { SettingsPageColumn } from '../layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { ConnectionAddDrawer } from './connection-add-drawer.tsx';
import { ConnectionListSection } from './connection-list-section.tsx';
import { ConnectionPresetSection } from './connection-preset-section.tsx';

export function ConnectionsPage({ embedded = false }: { embedded?: boolean }) {
    const { slug = '' } = useParams();
    const { server } = useServerContext();
    const [isAddOpen, setIsAddOpen] = React.useState(false);
    const navigate = useNavigate();

    return (
        <RequireOperator
            description="Connections are managed by Server operators."
            role={server.role}
        >
            <SettingsPageColumn width="table">
                {embedded ? null : (
                    <Link
                        className="text-muted hover:text-foreground text-sm"
                        to={serverRoute(slug)}
                    >
                        Back to /{slug}
                    </Link>
                )}
                <SettingsPageHeader title="Connections" />
                <ConnectionPresetSection serverId={server.id} />
                <ConnectionListSection
                    onAdd={() => setIsAddOpen(true)}
                    onSelect={(connectionId) =>
                        navigate(settingsConnectionRoute(slug, connectionId))
                    }
                    serverId={server.id}
                />
                <ConnectionAddDrawer
                    onOpenChange={setIsAddOpen}
                    open={isAddOpen}
                    serverId={server.id}
                />
            </SettingsPageColumn>
        </RequireOperator>
    );
}
