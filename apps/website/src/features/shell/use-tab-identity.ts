import { useParams } from 'react-router-dom';
import { useArtifact } from '../../hooks/artifacts/use-artifact.ts';
import { useBrowserViews } from '../../hooks/browser/browser-views-context.ts';
import type { TabLocation } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useChats } from '../../hooks/servers/use-chats.ts';
import { useServer } from '../../hooks/servers/use-server.ts';
import { useWorkerSummary } from '../../hooks/servers/use-worker.ts';
import { useCapyShell } from '../capy-shell/capy-shell-preference.ts';
import {
    parseTabPage,
    resolveTabIdentity,
    type TabIdentity,
    type TabIdentityRecords,
    type TabPage,
} from './tab-identity.ts';

/**
 * A tab's live identity from its current location. Reads the synced chat and
 * Agent lists every sidebar row already holds, so a tab costs no query of its
 * own; a shared artifact tab adds its record's title (`useSharedArtifactTabTitle`).
 */
export function useTabIdentity(
    location: TabLocation,
    extras: Partial<Pick<TabIdentityRecords, 'artifactTitle' | 'workerTitle'>> = {}
): TabIdentity {
    const serverId = useTabServerId();
    const chats = useChats(serverId);
    const agents = useAgents(serverId);
    const views = useBrowserViews();
    const page = parseTabPage(location, { capyShell: useCapyShell() });
    const browserTab = page.kind === 'browser' ? (views?.views.get(page.viewId) ?? null) : null;
    return resolveTabIdentity(page, {
        agents: agents.data ?? null,
        artifactTitle: extras.artifactTitle ?? null,
        browserTab,
        chats: chats.data ?? null,
        workerTitle: extras.workerTitle ?? null,
    });
}

/** A shared artifact page's title, from the record its page already reads; mount only for those tabs. */
export function useSharedArtifactTabTitle(
    shared: NonNullable<Extract<TabPage, { kind: 'artifact' }>['shared']>
): string | null {
    const serverId = useTabServerId() ?? '';
    const artifact = useArtifact(serverId, shared.artifactId, shared.revisionId ?? undefined);
    return artifact.data?.artifact.title ?? null;
}

/** A Worker page's title, from the summary its page already reads; mount only for those tabs. */
export function useWorkerTabTitle(workerId: string) {
    const serverId = useTabServerId() ?? null;
    return useWorkerSummary(serverId, workerId, serverId !== null)?.title ?? null;
}

function useTabServerId(): string | undefined {
    const { slug = '' } = useParams();
    return useServer(slug, slug !== '').data?.id;
}
