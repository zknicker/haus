import { TASK_AUTO_TITLE_MAX_CHARS } from '@haus/api';

export function autoTaskTitle(firstMessage: string) {
    const line =
        firstMessage
            .split('\n')
            .map((text) => text.replace(/^[\s#>*-]+/u, '').trim())
            .find((text) => text.length > 0) ?? 'Task';
    if (line.length <= TASK_AUTO_TITLE_MAX_CHARS) {
        return line;
    }
    const cut = line.slice(0, TASK_AUTO_TITLE_MAX_CHARS - 1);
    const wordEnd = cut.lastIndexOf(' ');
    const kept = wordEnd > TASK_AUTO_TITLE_MAX_CHARS / 2 ? cut.slice(0, wordEnd) : cut;
    return `${kept.trimEnd()}…`;
}
