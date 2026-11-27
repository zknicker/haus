import type { Chat } from '@haus/api';
import * as z from 'zod';
import type { ServerDetail } from '../../lib/haus-server.tsx';

export interface AgentPanelSubject {
    agentId: string;
    kind: 'captain';
}

export const captainPanelTabs = ['overview', 'issues', 'agents-md'] as const;
export type CaptainPanelTab = (typeof captainPanelTabs)[number];

export const captainDrills = [
    'runs-on',
    'model',
    'settings',
    'automations',
    'skills',
    'connections',
    'permissions',
    'workspace',
    'profile',
    'activity',
] as const;
export type CaptainDrill = (typeof captainDrills)[number];

export const captainDrillLabels: Record<CaptainDrill, string> = {
    activity: 'Activity',
    automations: 'Automations',
    connections: 'Connections',
    model: 'Model',
    permissions: 'Permissions',
    profile: 'Profile',
    'runs-on': 'Runs on',
    settings: 'All settings',
    skills: 'Skills',
    workspace: 'Workspace',
};

export const captainSettingDrills = [
    'automations',
    'skills',
    'connections',
    'permissions',
    'workspace',
    'profile',
] as const satisfies readonly CaptainDrill[];

const panelViewSchema = z
    .object({
        drill: z.enum(captainDrills).nullable(),
        issue: z.string().min(1).optional(),
        tab: z.enum(captainPanelTabs),
    })
    .strict();

export const agentPanelStateSchema = z
    .object({ open: z.boolean(), view: panelViewSchema })
    .strict();

export type AgentPanelView = z.infer<typeof panelViewSchema>;
export type AgentPanelState = z.infer<typeof agentPanelStateSchema>;

export const overviewView: AgentPanelView = { drill: null, tab: 'overview' };

export const defaultAgentPanelState: AgentPanelState = { open: true, view: overviewView };

export function agentPanelSubject(chat: Pick<Chat, 'kind' | 'peerAgentId'>) {
    return chat.kind === 'captain' && chat.peerAgentId
        ? ({ agentId: chat.peerAgentId, kind: 'captain' } satisfies AgentPanelSubject)
        : null;
}

export function agentPanelKey(subject: AgentPanelSubject) {
    return `${subject.kind}:${subject.agentId}`;
}

export function drillParent(drill: CaptainDrill) {
    return (captainSettingDrills as readonly CaptainDrill[]).includes(drill)
        ? ('settings' as const)
        : null;
}

export function canOpenCaptainDrill(drill: CaptainDrill, role: ServerDetail['role']) {
    return drill !== 'permissions' || role === 'owner' || role === 'admin';
}

export function captainViewForSection(section: string | undefined, role: ServerDetail['role']) {
    const drill = sectionDrills.get(section ?? '') ?? null;
    return drill && canOpenCaptainDrill(drill, role)
        ? ({ drill, tab: 'overview' } satisfies AgentPanelView)
        : overviewView;
}

const sectionDrills: ReadonlyMap<string, CaptainDrill> = new Map([
    ['activity', 'activity'],
    ['automations', 'automations'],
    ['connections', 'connections'],
    ['instructions', 'profile'],
    ['model', 'model'],
    ['permissions', 'permissions'],
    ['profile', 'profile'],
    ['runtime', 'runs-on'],
    ['settings', 'settings'],
    ['setup', 'runs-on'],
    ['skills', 'skills'],
    ['workspace', 'workspace'],
]);

export function captainSectionForDrill(drill: CaptainDrill) {
    return drill === 'runs-on' ? 'runtime' : drill;
}
