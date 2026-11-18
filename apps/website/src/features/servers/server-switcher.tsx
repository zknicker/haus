import { NavLink } from 'react-router-dom';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import type { ServerSummary } from '../../lib/haus-server.tsx';
import { cn } from '../../lib/utils.ts';
import { serverRoute } from './server-routes.ts';

/** Switches between the Haus servers this human can open. */
export function ServerSwitcher({
    onSelect,
    servers,
}: {
    onSelect?: () => void;
    servers: ServerSummary[];
}) {
    return (
        <nav aria-label="Your Servers" className="flex flex-col gap-1">
            {servers.map((server) => (
                <NavLink
                    className={({ isActive }) =>
                        cn(
                            'text-foreground focus-visible:ring-focus rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:ring-2',
                            isActive ? 'bg-surface-secondary' : 'hover:bg-surface-secondary'
                        )
                    }
                    key={server.id}
                    onClick={onSelect}
                    to={serverRoute(server.slug)}
                >
                    <div className="flex items-center gap-3">
                        <EntityAvatar name={server.displayName || server.slug} size="sm" />
                        <span className="min-w-0">
                            <span className="block truncate">{server.displayName}</span>
                            <span className="text-muted block text-sm">/{server.slug}</span>
                        </span>
                    </div>
                </NavLink>
            ))}
        </nav>
    );
}
