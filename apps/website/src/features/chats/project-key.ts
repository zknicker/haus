import { taskKeyPrefixSchema } from '@haus/api';
import { projectRefusalCode } from '../../lib/project-homes.ts';

export function normalizeProjectKey(value: string) {
    return value.trim().toUpperCase();
}

export function projectKeyIssue(key: string) {
    if (key.length === 0) {
        return null;
    }
    const parsed = taskKeyPrefixSchema.safeParse(key);
    return parsed.success ? null : (parsed.error.issues[0]?.message ?? null);
}

export function projectKeyRefusal(error: unknown) {
    const code = projectRefusalCode(error);
    return (code === 'TASK_KEY_TAKEN' || code === 'PROJECT_KEY_FIXED') && error instanceof Error
        ? error.message
        : null;
}
