import { claimConflictSchema } from '@haus/api';
import * as z from 'zod';
import { agentMessageSchema, claimActorSchema } from '../agent-api-schemas.ts';
import { AgentCliError } from '../agent-error.ts';
import { shortMessageId } from '../agent-format.ts';
import { isThreadTarget } from '../agent-render.ts';

export const claimRowSchema = z.object({
    assignee: claimActorSchema.nullable(),
    message: agentMessageSchema,
    number: z.number().int().positive(),
    status: z.enum(['todo', 'in_progress', 'in_review', 'done', 'closed']),
    target: z.string().nullable(),
    version: z.number().int().nonnegative(),
});
export type ClaimRow = z.infer<typeof claimRowSchema>;

export const claimResultSchema = z.object({
    claim: claimRowSchema.nullable(),
    claimConflict: claimConflictSchema.nullable(),
    number: z.number().int().positive(),
    outcome: z.enum(['already_yours', 'claimed', 'refused']),
    reason: z.string().nullable(),
});
type ClaimResult = z.infer<typeof claimResultSchema>;

export function formatClaimList(claims: ClaimRow[], omitted: number): string {
    if (claims.length === 0) {
        return 'No claims found. A claim is a message with claim metadata — claim work with haus claim, or create new work with haus claim create.\n';
    }
    const more =
        omitted > 0
            ? `\nTruncated: ${omitted} more. Narrow with --target, --status, or --mine.`
            : '';
    return `${claims.map((claim) => claimLine(claim)).join('\n')}${more}\n\nClaim before you work: haus claim --target <target> --number <n>\n`;
}

/** Each created claim names its own thread address as a reference. */
export function formatClaimsCreated(claims: ClaimRow[], fallbackTarget: string): string {
    return `${claims
        .map(
            (claim) =>
                `Created claim #${claim.number} [${claim.status}] in ${claim.target ?? fallbackTarget}. Message ID: ${claim.message.id}. Thread: ${threadRef(claim, fallbackTarget)}.`
        )
        .join('\n')}\n`;
}

/**
 * One row per requested claim. Granted rows name the inline reply to the
 * claim's message as a fact of the claim, never its claim thread and never
 * routing advice: the requester follows that thread, so every post there
 * becomes their unread (ADR 0029). A Thread claim's message sits in a Thread,
 * which refuses `--reply-to`, so its row names that Thread's target instead.
 */
export function formatClaimResults(results: ClaimResult[], fallbackTarget: string): string {
    const counts = [
        `${results.filter((row) => row.outcome === 'claimed').length} claimed`,
        countLabel(results, 'already_yours', 'already yours'),
        countLabel(results, 'refused', 'refused'),
    ].filter(Boolean);
    const lines = results.map((row) => resultLine(row, fallbackTarget));
    return `Claim results (${counts.join(', ')}):\n${lines.join('\n')}\n`;
}

/**
 * Zero granted rows is the only failure: a partial claim did work, and an
 * already-held claim still authorizes it. A lone lock conflict keeps the
 * structured conflict block.
 */
export function claimRefusal(results: ClaimResult[]): AgentCliError | null {
    if (results.some((row) => row.outcome !== 'refused')) {
        return null;
    }
    const [only] = results;
    if (results.length === 1 && only?.claimConflict) {
        return new AgentCliError('TASK_CONFLICT', only.reason ?? 'Claim refused.', {
            claimConflict: only.claimConflict,
        });
    }
    const summary = results.map((row) => `#${row.number} ${refusalReason(row)}`).join('; ');
    return new AgentCliError('TASK_CONFLICT', `Claim refused — ${summary}.`, {
        nextAction:
            'Do not retry the identical claim or start conflicting work. If you own this lane, correct the routing in the original thread.',
    });
}

export function assigneeLabel(assignee: ClaimRow['assignee']) {
    if (!assignee) {
        return 'unassigned';
    }
    return assignee.handle ? `@${assignee.handle}` : `agent:${assignee.id}`;
}

function resultLine(row: ClaimResult, fallbackTarget: string) {
    const id = row.claim ? ` (msg:${shortMessageId(row.claim.message.id)})` : '';
    if (row.outcome === 'refused') {
        return `#${row.number}${id}: refused — ${refusalReason(row)}`;
    }
    const outcome = row.outcome === 'claimed' ? 'claimed' : 'already yours';
    const reply = row.claim ? ` · ${replyFact(row.claim, fallbackTarget)}` : '';
    return `#${row.number}${id}: ${outcome}${reply}`;
}

function replyFact(claim: ClaimRow, fallbackTarget: string) {
    const target = claim.target ?? fallbackTarget;
    return isThreadTarget(target)
        ? `thread reply --target "${target}", no --reply-to`
        : `inline reply --target "${target}" --reply-to ${shortMessageId(claim.message.id)}`;
}

function refusalReason(row: ClaimResult) {
    const holder = row.claimConflict?.currentAssignee?.name;
    return holder ? `held by @${holder}` : (row.reason ?? 'refused').replace(/\.$/u, '');
}

function countLabel(results: ClaimResult[], outcome: ClaimResult['outcome'], label: string) {
    const count = results.filter((row) => row.outcome === outcome).length;
    return count > 0 ? `${count} ${label}` : '';
}

/** A Thread claim's thread address is the Thread it sits in, whose target the row carries. */
function threadRef(claim: ClaimRow, fallbackTarget: string) {
    const target = claim.target ?? fallbackTarget;
    return `"${isThreadTarget(target) ? target : `${target}:${shortMessageId(claim.message.id)}`}"`;
}

function claimLine(claim: ClaimRow): string {
    const assignee = claim.assignee ? ` ${assigneeLabel(claim.assignee)}` : ' unassigned';
    const where = claim.target ? ` in ${claim.target}` : '';
    const title = claim.message.content.replaceAll(/\s+/gu, ' ').trim();
    const clipped = title.length > 80 ? `${title.slice(0, 79)}…` : title;
    return `#${claim.number} [${claim.status}]${assignee}${where} rev=${claim.version} msg=${shortMessageId(claim.message.id)}: ${clipped}`;
}
