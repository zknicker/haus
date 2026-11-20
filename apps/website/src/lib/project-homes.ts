import { type Agent, type Chat, type Project, projectErrorCodeSchema } from '@haus/api';

export interface CaptainCandidate {
    agent: Agent;
    home: Project;
}

export function agentHomeProject(projects: readonly Project[], agentId: string) {
    return projects.find((project) => project.homeAgentIds.includes(agentId));
}

export function homeIsFixed(agent: Agent) {
    return agent.factoryKind === 'cove';
}

export function projectChoice(project: Project, chat: Chat | undefined) {
    if (!chat || chat.archivedAt) {
        return null;
    }
    return { chatId: project.chatId, color: chat.color, icon: chat.icon, name: project.name };
}

export function projectChoices(
    projects: readonly Project[],
    chats: ReadonlyMap<string, Chat>,
    except?: string
) {
    return projects.flatMap((project) => {
        const choice =
            project.chatId === except ? null : projectChoice(project, chats.get(project.chatId));
        return choice ? [choice] : [];
    });
}

export function matchesProjectSearch(name: string, input: string) {
    return name.toLowerCase().includes(input.trim().toLowerCase());
}

export function projectCaptains(
    projects: readonly Project[],
    agents: readonly Agent[],
    projectId: string
) {
    const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
    const project = projects.find((candidate) => candidate.chatId === projectId);
    const candidates: CaptainCandidate[] = projects
        .filter((home) => home.chatId !== projectId)
        .flatMap((home) =>
            home.homeAgentIds.flatMap((agentId) => {
                const agent = agentsById.get(agentId);
                return agent && !homeIsFixed(agent) ? [{ agent, home }] : [];
            })
        );
    const captains: Agent[] = (project?.homeAgentIds ?? []).flatMap((agentId) => {
        const agent = agentsById.get(agentId);
        return agent ? [agent] : [];
    });
    return { candidates, captains };
}

export function projectRefusalCode(error: unknown) {
    const project = (error as { data?: { project?: { code?: unknown } } } | null)?.data?.project;
    const parsed = projectErrorCodeSchema.safeParse(project?.code);
    return parsed.success ? parsed.data : null;
}
