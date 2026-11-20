import { TASK_TITLE_MAX_CHARS } from '@haus/api';

export interface HomeAsk {
    captain: { agentId: string; name: string };
    projectChatId: string;
    text: string;
}

export interface HomeTaskInput {
    assigneeAgentId: string;
    description?: string;
    projectId: string;
    title: string;
}

export function planHomeTask(ask: HomeAsk) {
    const text = ask.text.trim();
    if (text.length === 0) {
        return null;
    }
    const [firstLine = '', ...rest] = text.split('\n');
    const lead = firstLine.trim();
    const fits = lead.length <= TASK_TITLE_MAX_CHARS;
    const description = fits ? rest.join('\n').trim() : text;
    return {
        assigneeAgentId: ask.captain.agentId,
        ...(description ? { description } : {}),
        projectId: ask.projectChatId,
        title: fits ? lead : `${lead.slice(0, TASK_TITLE_MAX_CHARS - 1)}…`,
    } satisfies HomeTaskInput;
}

export function homeCaptainId({
    captainIds,
    picked,
    projectCaptainIds,
}: {
    captainIds: readonly string[];
    picked: string | null;
    projectCaptainIds: readonly string[];
}) {
    if (picked !== null && captainIds.includes(picked)) {
        return picked;
    }
    return projectCaptainIds.find((id) => captainIds.includes(id)) ?? captainIds[0] ?? null;
}
