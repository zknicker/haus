import { useAgents } from '../../hooks/members/use-agents.ts';
import { useHausServerConnectionState } from '../../lib/haus-server.tsx';

export function ConnectionNotice({
    serverError,
    serverId,
}: {
    serverError: boolean;
    serverId: string;
}) {
    const agents = useAgents(serverId);
    const connection = useHausServerConnectionState();

    if (!(serverError || agents.error || connection !== 'connected')) {
        return null;
    }

    return (
        <div className="card-shell bg-surface-secondary text-muted shadow-surface absolute top-2 right-3 z-20 px-2 py-1 text-sm">
            {agents.error && !agents.data
                ? 'Agent directory unavailable'
                : 'Server reconnecting · showing the latest data'}
        </div>
    );
}
