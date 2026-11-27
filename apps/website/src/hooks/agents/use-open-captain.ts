import { useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    agentPanelKey,
    type CaptainDrill,
    overviewView,
} from '../../features/agent-panel/agent-panel-model.ts';
import { showAgentPanel } from '../../features/agent-panel/agent-panel-store.ts';
import { captainChatRoute } from '../../features/agent-panel/captain-chat-route.ts';

export interface OpenCaptainOptions {
    drill?: CaptainDrill;
}

export function useOpenCaptain() {
    const navigate = useNavigate();
    const { slug = '' } = useParams();
    return useOpenCaptainWith(navigate, slug);
}

export function useOpenCaptainWith(navigate: (path: string) => void, slug: string) {
    const route = useRef({ navigate, slug });
    route.current = { navigate, slug };
    return useCallback((agentId: string, options: OpenCaptainOptions = {}) => {
        openCaptain(route.current.navigate, route.current.slug, agentId, options);
    }, []);
}

export function openCaptain(
    navigate: (path: string) => void,
    slug: string,
    agentId: string,
    options: OpenCaptainOptions = {}
) {
    showCaptainPanel(agentId, options);
    navigate(captainChatRoute(slug, agentId));
}

export function showCaptainPanel(agentId: string, { drill }: OpenCaptainOptions = {}) {
    showAgentPanel(
        agentPanelKey({ agentId, kind: 'captain' }),
        drill ? { drill, tab: 'overview' } : overviewView
    );
}
