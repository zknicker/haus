import * as z from 'zod';
import { linearObjectIdSchema } from './linear.ts';

// Linear issue references in chat (specs/linear-app.md#issue-references-in-chat):
// what `linear.issue` answers for one issue URL.

const idSchema = z.string().trim().min(1);
const timestampSchema = z.iso.datetime({ offset: true });
const linearColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/u);

export const linearIssueInputSchema = z.object({ serverId: idSchema, url: z.url() }).strict();

/** One issue as a chip and its hovercard show it. */
export const linearIssueViewSchema = z
    .object({
        assignee: z.object({ id: linearObjectIdSchema, name: z.string().min(1) }).nullable(),
        /** The Agent named by the issue's Haus `Agent` label. */
        delegateAgentId: idSchema.nullable(),
        id: linearObjectIdSchema,
        identifier: z.string().min(1),
        labels: z.array(
            z
                .object({ color: linearColorSchema, id: linearObjectIdSchema, name: z.string() })
                .strict()
        ),
        /** The latest ledger-attributed Agent change. */
        lastAgentChange: z
            .object({ agentId: idSchema, changedAt: timestampSchema, summary: z.string().min(1) })
            .strict()
            .nullable(),
        state: z
            .object({ color: linearColorSchema, id: linearObjectIdSchema, name: z.string() })
            .strict(),
        /** A signed, short-lived Server thumbnail URL. */
        thumbnailUrl: z.url().nullable(),
        title: z.string(),
        url: z.url(),
    })
    .strict();
export type LinearIssueView = z.infer<typeof linearIssueViewSchema>;

export const linearIssueUnavailableReasonSchema = z.enum([
    'workspace_not_connected',
    'workspace_unavailable',
    'issue_not_found',
]);
export type LinearIssueUnavailableReason = z.infer<typeof linearIssueUnavailableReasonSchema>;

export const linearIssueResultSchema = z.discriminatedUnion('status', [
    z.object({ issue: linearIssueViewSchema, status: z.literal('available') }).strict(),
    z
        .object({ reason: linearIssueUnavailableReasonSchema, status: z.literal('unavailable') })
        .strict(),
]);
export type LinearIssueResult = z.infer<typeof linearIssueResultSchema>;

/** One Linear issue URL reduced to what selects the workspace and the issue. */
export interface LinearIssueUrl {
    /** The issue key, such as `DES-142`, with the team key upper-cased. */
    identifier: string;
    /** `https://linear.app/<urlKey>/issue/<identifier>`: no slug, query, or hash. */
    url: string;
    urlKey: string;
}

const linearUrlKeyPattern = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const linearIdentifierPattern = /^([A-Za-z0-9]{1,16})-([1-9][0-9]{0,8})$/u;

/**
 * Parses `https://linear.app/<urlKey>/issue/<KEY>-<n>[/<slug>]`. Anything else,
 * including another host, a port, credentials, or extra path segments, is not
 * an issue reference. The normalized URL is the chip's cache identity, so two
 * links to one issue that differ only by slug share one read.
 */
export function parseLinearIssueUrl(href: string): LinearIssueUrl | null {
    let url: URL;
    try {
        url = new URL(href);
    } catch {
        return null;
    }
    if (
        url.protocol !== 'https:' ||
        url.hostname !== 'linear.app' ||
        url.port !== '' ||
        url.username !== '' ||
        url.password !== ''
    ) {
        return null;
    }
    const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
    if (segments.length < 3 || segments.length > 4 || segments[1] !== 'issue') {
        return null;
    }
    const urlKey = segments[0]?.toLowerCase() ?? '';
    const match = linearIdentifierPattern.exec(segments[2] ?? '');
    if (!(linearUrlKeyPattern.test(urlKey) && match)) {
        return null;
    }
    const identifier = `${match[1]?.toUpperCase()}-${match[2]}`;
    return { identifier, url: `https://linear.app/${urlKey}/issue/${identifier}`, urlKey };
}
