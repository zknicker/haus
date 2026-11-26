import { TASK_TITLE_MAX_CHARS } from '@haus/api';

export interface HomeAsk {
    projectChatId: string;
    text: string;
}

export interface HomeTaskInput {
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
        ...(description ? { description } : {}),
        projectId: ask.projectChatId,
        title: fits ? lead : `${lead.slice(0, TASK_TITLE_MAX_CHARS - 1)}…`,
    } satisfies HomeTaskInput;
}
