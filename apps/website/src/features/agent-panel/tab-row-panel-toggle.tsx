import type { Chat } from '@haus/api';
import * as React from 'react';
import { useParams } from 'react-router-dom';
import { useDesktopTabs } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { currentLocation, type PaneSide } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { useServer } from '../../hooks/servers/use-server.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { parseTabPage } from '../shell/tab-identity.ts';
import { agentPanelKey, agentPanelSubject } from './agent-panel-model.ts';
import { ClosedAgentPanelToggle } from './agent-panel-toggle.tsx';

export function TabRowPanelToggle({ pane }: { pane: PaneSide }) {
    const panelKey = usePanePanelKey(pane);
    return panelKey ? (
        <span className="workspace-tab-row-end">
            <ClosedAgentPanelToggle panelKey={panelKey} />
        </span>
    ) : null;
}

function usePanePanelKey(pane: PaneSide) {
    const { state } = useDesktopTabs();
    const selected = state[pane]?.selectedTabId;
    const tab = selected ? state.tabs[selected] : undefined;
    const page = tab ? parseTabPage(currentLocation(tab)) : null;
    const chatId = page?.kind === 'chat' ? page.chatId : null;
    const { slug = '' } = useParams();
    const serverId = useServer(slug, slug !== '').data?.id ?? '';
    const select = React.useCallback(
        (chats: Chat[]) => {
            const chat = chats.find((candidate) => candidate.id === chatId);
            const subject = chat ? agentPanelSubject(chat) : null;
            return subject ? agentPanelKey(subject) : null;
        },
        [chatId]
    );
    const chatKey =
        hausTrpc.chat.list.useQuery(
            { serverId },
            { ...queryPolicy.syncedSnapshot, enabled: serverId !== '' && chatId !== null, select }
        ).data ?? null;
    if (page?.kind === 'dm') {
        return agentPanelKey({ agentId: page.agentId, kind: 'captain' });
    }
    return chatId ? chatKey : null;
}
