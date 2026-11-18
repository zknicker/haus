import { formatTaskTarget, taskPriorities, taskStates } from '@haus/api';
import * as z from 'zod';
import { indentContinuationLines } from '../../inbox-header-format.ts';
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
    assignee: actorSchema.nullable(),
    createdAt: z.string(),
    createdBy: actorSchema,
    dueOn: z.string().nullable(),
    key: z.string(),
    labels: z.array(z.string()),
    priority: z.enum(taskPriorities),
    state: z.enum(taskStates),
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

export function describeTask(task: TaskRow): string {
    const facts = [
        ...(task.priority === 'none' ? [] : [`priority ${task.priority}`]),
        task.assignee ? `assigned ${actorLabel(task.assignee)}` : 'unassigned',
        ...(task.dueOn ? [`due ${task.dueOn}`] : []),
        ...(task.labels.length > 0 ? [`labels ${task.labels.join(', ')}`] : []),
    ];
    const title = task.title.replaceAll(/\s+/gu, ' ').trim();
    return `${task.key} [${task.state}] "${title}" · ${facts.join(' · ')}`;
}

export function taskPlaceLine(key: string): string {
    return `Task target: ${formatTaskTarget(key)}`;
}

export function actorLabel(actor: TaskActorRow): string {
    if (actor.handle) {
        return `@${actor.handle}`;
    }
    return actor.type === 'agent' ? 'an Agent with no handle' : 'a person with no handle';
}

export function formatTaskDetail(detail: z.infer<typeof taskShowSchema>): string {
    const { description, mentions, reminders, task } = detail;
    const lines = [
        describeTask(task),
        taskPlaceLine(task.key),
        `Created by ${actorLabel(task.createdBy)} ${formatUtcTime(task.createdAt)}; updated ${formatUtcTime(task.updatedAt)}; version ${task.version}`,
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

function mentionLine(mention: z.infer<typeof taskShowSchema>['mentions'][number]): string {
    return `- [target=${mention.target} msg=${shortMessageId(mention.messageId)} time=${formatUtcTime(mention.createdAt)}] ${mention.author}: ${clip(mention.excerpt)}`;
}

function reminderLine(reminder: z.infer<typeof taskShowSchema>['reminders'][number]): string {
    const fire = reminder.nextFireAt ? formatUtcTime(reminder.nextFireAt) : 'none';
    const repeat = reminder.repeat ? ` (${reminder.repeat})` : '';
    return `- ${reminder.id} "${reminder.title}" next fire ${fire}${repeat}, anchored in ${reminder.anchorTarget}`;
}
