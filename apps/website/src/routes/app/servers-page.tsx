import { Navigate, useSearchParams } from 'react-router-dom';
import { ActivationLoading } from '../../components/activation/activation-loading.tsx';
import { ActivationShell, ActivationStep } from '../../components/activation/activation-shell.tsx';
import { readLastServerSlug, resolveEntryServer } from '../../features/servers/server-choice.ts';
import { ServerChoiceFlow } from '../../features/servers/server-choice-flow.tsx';
import { serverRoute } from '../../features/servers/server-routes.ts';
import { useServerList } from '../../hooks/servers/use-server-list.ts';

/** Resume a joined Server unless the human explicitly opens the chooser. */
export function ServersPage() {
    const servers = useServerList();
    const [search] = useSearchParams();

    if (!servers.data && servers.error) {
        return (
            <ActivationShell>
                <ActivationStep description={servers.error.message} title="Servers Unavailable" />
            </ActivationShell>
        );
    }

    if (!servers.data) {
        return <ActivationLoading />;
    }

    const entryServer = resolveEntryServer(servers.data, readLastServerSlug());
    if (entryServer && !search.has('choose')) {
        return (
            <>
                <ActivationLoading />
                <Navigate replace to={serverRoute(entryServer.slug)} />
            </>
        );
    }

    return (
        <ActivationShell>
            <ServerChoiceFlow servers={servers.data} />
        </ActivationShell>
    );
}
