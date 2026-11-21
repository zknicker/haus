import { CapyHomePage } from '../../features/capy-shell/home-page.tsx';
import { useServerContext } from '../../features/servers/server-context.ts';

export function ServerDefaultPage() {
    const { server } = useServerContext();
    return (
        <CapyHomePage
            canManage={server.role === 'owner' || server.role === 'admin'}
            serverId={server.id}
            slug={server.slug}
        />
    );
}
