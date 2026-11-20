import { Outlet, useParams } from 'react-router-dom';
import { ActivationLoading } from '../../components/activation/activation-loading.tsx';
import { ActivationShell, ActivationStep } from '../../components/activation/activation-shell.tsx';
import { useServer } from '../../hooks/servers/use-server.ts';

export function ServerRouteGate() {
    const { slug = '' } = useParams();
    const server = useServer(slug);

    if (server.error && !server.data) {
        return (
            <ActivationShell>
                <ActivationStep description={server.error.message} title="Server Unavailable" />
            </ActivationShell>
        );
    }
    if (!server.data) {
        return <ActivationLoading />;
    }
    return <Outlet />;
}
