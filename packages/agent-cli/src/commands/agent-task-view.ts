import { indentContinuationLines } from '@haus/agent-prompt';
import { formatTaskTarget } from '@haus/api';
import * as z from 'zod';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { formatUtcTime, shortMessageId } from '../agent-format.ts';
import { clip } from './agent-reminder-view.ts';

export interface TaskDeps {
    client: AgentApiRequester;
    readStdin(): Promise<string>;
    write(text: string): void;
}

const actorSchema = z.object({
    handle: z.string().nullable(),
    type: z.enum(['agent', 'human']),
});

const taskRowSchema = z.object({
    archivedAt: z.string().nullable(),
    createdAt: z.string(),
    createdBy: actorSchema,
    shortId: z.string(),
    title: z.string(),
    updatedAt: z.string(),
    version: z.number().int().positive(),
});

export const taskListSchema = z.object({
    omitted: z.number().int().nonnegative(),
    tasks: z.array(taskRowSchema),
});
export const taskSingleSchema = z.object({ task: taskRowSchema });
export const taskStartSchema = z.object({ target: z.string(), task: taskRowSchema });
export const taskAttachPullRequestSchema = z.object({
    pullRequest: z.object({
        number: z.number().int().positive(),
        repository: z.string(),
        url: z.string(),
    }),
    task: taskRowSchema,
});
export const taskShowSchema = z.object({
    description: z.string(),
    mentions: z.array(
        z.object({
            author: z.string(),
            createdAt: z.string(),
            excerpt: z.string(),
            messageId: z.string(),
            target: z.string(),
        })
    ),
    reminders: z.array(
        z.object({
            anchorTarget: z.string(),
            id: z.string(),
            nextFireAt: z.string().nullable(),
            repeat: z.string().nullable(),
            title: z.string(),
        })
    ),
    task: taskRowSchema,
});

export type TaskRow = z.infer<typeof taskRowSchema>;
type TaskActorRow = z.infer<typeof actorSchema>;

export function describeTask(task: TaskRow) {
    const title = task.title.replaceAll(/\s+/gu, ' ').trim();
    const archived = task.archivedAt ? ` · archived ${formatUtcTime(task.archivedAt)}` : '';
    return `${task.shortId} "${title}" · started by ${actorLabel(task.createdBy)}${archived}`;
}

export function taskPlaceLine(shortId: string) {
    return `Task target: ${formatTaskTarget(shortId)}`;
}

export function actorLabel(actor: TaskActorRow) {
    if (actor.handle) {
        return `@${actor.handle}`;
    }
    return actor.type === 'agent' ? 'an Agent with no handle' : 'a person with no handle';
}

export function formatTaskDetail(detail: z.infer<typeof taskShowSchema>) {
    const { description, mentions, reminders, task } = detail;
    const lines = [
        describeTask(task),
        taskPlaceLine(task.shortId),
        `Created ${formatUtcTime(task.createdAt)}; updated ${formatUtcTime(task.updatedAt)}; version ${task.version}`,
    ];
    if (description) {
        lines.push('', 'Description:', indentContinuationLines(description));
    }
    if (mentions.length > 0) {
        lines.push('', 'Mentioned in (newest first):', ...mentions.map(mentionLine));
    }
    if (reminders.length > 0) {
        lines.push('', 'Reminders:', ...reminders.map(reminderLine));
    }
    return `${lines.join('\n')}\n`;
}

function mentionLine(mention: z.infer<typeof taskShowSchema>['mentions'][number]) {
    return `- [target=${mention.target} msg=${shortMessageId(mention.messageId)} time=${formatUtcTime(mention.createdAt)}] ${mention.author}: ${clip(mention.excerpt)}`;
}

function reminderLine(reminder: z.infer<typeof taskShowSchema>['reminders'][number]) {
    const fire = reminder.nextFireAt ? formatUtcTime(reminder.nextFireAt) : 'none';
    const repeat = reminder.repeat ? ` (${reminder.repeat})` : '';
    return `- ${reminder.id} "${reminder.title}" next fire ${fire}${repeat}, anchored in ${reminder.anchorTarget}`;
}
