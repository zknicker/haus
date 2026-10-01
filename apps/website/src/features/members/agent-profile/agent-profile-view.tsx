import type { Agent } from '@haus/api';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import type { AgentSection } from './agent-sections.ts';

export interface AgentProfileViewProps {
    agent: Agent;
    onDeleted: () => void;
    onSectionChange: (section: AgentSection) => void;
    server: ServerDetail;
    section: AgentSection;
}

/**
 * An Agent's profile body, host-agnostic: the web route and the desktop agent
 * tab both render it. It owns its breadcrumb and never portals into the band.
 */
// SEAM: the hub implementation lands with the profile-hub slice.
export function AgentProfileView(_props: AgentProfileViewProps) {
    return null;
}
