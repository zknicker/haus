import type { TaskStartInput } from '@haus/api';

export interface HomeAsk {
    computerId: null | string;
    model: string;
    projectChatId: string;
    requestId: string;
    serverId: string;
    text: string;
}

export function planHomeTask(ask: HomeAsk) {
    const prompt = ask.text.trim();
    if (prompt.length === 0) {
        return null;
    }
    return {
        ...(ask.computerId ? { computerId: ask.computerId } : {}),
        model: ask.model,
        projectId: ask.projectChatId,
        prompt,
        requestId: ask.requestId,
        serverId: ask.serverId,
    } satisfies TaskStartInput;
}
