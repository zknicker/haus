import { useParams } from 'react-router-dom';
import { useArtifact } from '../../hooks/artifacts/use-artifact.ts';
import { useBrowserViews } from '../../hooks/browser/browser-views-context.ts';
import type { TabLocation } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useChats } from '../../hooks/servers/use-chats.ts';
import { useServer } from '../../hooks/servers/use-server.ts';
import { useThreadAnchor } from '../../hooks/threads/use-thread-anchor.ts';
import { messagePreviewLine } from '../chats/message-preview-line.ts';
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
 * own; a Thread tab adds its anchor (see `useThreadTabExcerpt`) and a shared
 * artifact tab its record's title (`useSharedArtifactTabTitle`).
 */
export function useTabIdentity(
    location: TabLocation,
    extras: Partial<Pick<TabIdentityRecords, 'artifactTitle' | 'threadExcerpt'>> = {}
): TabIdentity {
    const serverId = useTabServerId();
    const chats = useChats(serverId);
    const agents = useAgents(serverId);
    const views = useBrowserViews();
    const page = parseTabPage(location);
    const browserTab = page.kind === 'browser' ? (views?.views.get(page.viewId) ?? null) : null;
    return resolveTabIdentity(page, {
        agents: agents.data ?? null,
        artifactTitle: extras.artifactTitle ?? null,
        browserTab,
        chats: chats.data ?? null,
        threadExcerpt: extras.threadExcerpt ?? null,
    });
}

/** A Thread page's root message as one line; mount only for Thread pages (it reads the chat's transcript). */
export function useThreadTabExcerpt(page: Extract<TabPage, { kind: 'thread' }>): string | null {
    const serverId = useTabServerId() ?? '';
    const thread = useThreadAnchor(serverId, page.chatId, page.anchorMessageId);
    return thread.anchor ? messagePreviewLine(thread.anchor.content) || 'Thread' : null;
}

/** A shared artifact page's title, from the record its page already reads; mount only for those tabs. */
export function useSharedArtifactTabTitle(
    shared: NonNullable<Extract<TabPage, { kind: 'artifact' }>['shared']>
): string | null {
    const serverId = useTabServerId() ?? '';
    const artifact = useArtifact(serverId, shared.artifactId, shared.revisionId ?? undefined);
    return artifact.data?.artifact.title ?? null;
}

function useTabServerId(): string | undefined {
    const { slug = '' } = useParams();
    return useServer(slug, slug !== '').data?.id;
}
