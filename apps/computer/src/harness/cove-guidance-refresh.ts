import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Bounded private event context; full mechanics remain in Cove's playbook and Manual.
const coveCoordinationContext =
    'Read notes/onboarding_playbook.md and notes/coordination.md if present, plus learned memory. Custom playbook or notes disabling offers take precedence. Honor custom guidance and current agreements. Quiet reviews, unchanged findings and declined monitoring need no acknowledgment or completion post; report only new actionable evidence. Confirm short scheduling requests and changed agreements once, after the receipt; do not send a preliminary acknowledgment. Created and assigned does not prove working or watching: reconcile lane schedule receipts and install the agreed bounded follow-up. At a suitable owner interaction after useful scope exists, include one optional weekly review offer with the useful answer; skip urgent and upgrade-only turns. Never wake or schedule to advertise it. Before sending an offer, write review_offer_state: offered in notes/coordination.md with scope, cadence, destination and offer_send_status (drafted, held, refused, uncertain, delivered). After confirmed delivery, save the message id and review_offer_state: pending there. Write enabled after a consented schedule receipt, declined on no, postponed on later. Preserve these states across restarts. Write literal review_offer_state: <state> lines; do not replace the field with a heading or State label. Reconcile uncertain delivery from canonical history; do not resend blindly. Retry a proven non-delivery once at a suitable interaction. Pending/enabled/declined/postponed offers must not repeat. Schedule only after explicit scope, cadence and destination agreement. Calendar repeats require --timezone with the agreed IANA zone; first-fire offsets do not set recurrence. Verify cadence and timezone in the receipt before confirming. Resolve unsupported Server timing first. Retrieve recipes/archetype/pa-coordinator, recipes/pattern/coordinator-synthesis and recipes/technique/reminder-cron before the first offer or review.';

/** Per-turn private context, so a warm Cove cannot silently skip its operating notes. */
export function coveTurnGuidanceNotice(factoryKind: 'cove' | 'ordinary'): string | null {
    return factoryKind === 'cove' ? `Cove coordination context: ${coveCoordinationContext}` : null;
}

/** Every notice includes the same consent and silence guards, including reminder wakes. */
export const coveGuidanceRefreshNotice = `Haus updated Cove's factory-managed onboarding guidance. Before acting, re-read notes/onboarding_playbook.md and notes/onboarding_knowledge_faq.md; they supersede earlier session assumptions. ${coveCoordinationContext}`;

export function coveGuidanceConflictNotice(files: readonly string[]): string {
    return `Haus could not update Cove's factory-managed onboarding guidance because these files were changed or removed: ${files.join(', ')}. Do not overwrite them. Preserve adjacent .haus-refresh-backup-* files if present for concurrent-edit recovery. Retrieve the relevant Haus Manual topic before claiming a capability is unavailable. ${coveCoordinationContext}`;
}

export async function hasPendingCoveGuidanceRefresh(agentRoot: string): Promise<boolean> {
    return await readFile(coveGuidanceRefreshReceiptPath(agentRoot))
        .then(() => true)
        .catch((error: unknown) => {
            if (isRecord(error) && error.code === 'ENOENT') {
                return false;
            }
            throw error;
        });
}

export async function markCoveGuidanceRefreshPending(agentRoot: string): Promise<void> {
    const receiptPath = coveGuidanceRefreshReceiptPath(agentRoot);
    await mkdir(dirname(receiptPath), { recursive: true });
    await writeFile(receiptPath, '{"version":1}\n', { mode: 0o600 });
}

export async function clearPendingCoveGuidanceRefresh(agentRoot: string): Promise<void> {
    await rm(coveGuidanceRefreshReceiptPath(agentRoot), { force: true });
}

function coveGuidanceRefreshReceiptPath(agentRoot: string): string {
    return join(agentRoot, 'runtime', 'cove-guidance-refresh.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
