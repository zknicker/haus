import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** One-turn private notices and the pending receipt for a Cove factory-guidance refresh. */
export const coveGuidanceRefreshNotice =
    "Haus updated Cove's factory-managed onboarding guidance. Before acting on this request, re-read notes/onboarding_playbook.md and notes/onboarding_knowledge_faq.md. Their current guidance supersedes earlier assumptions from this session.";

export function coveGuidanceConflictNotice(files: readonly string[]): string {
    return `Haus could not update Cove's factory-managed onboarding guidance because these files were changed or removed: ${files.join(', ')}. Do not overwrite them. Retrieve the relevant Haus Manual topic before claiming a capability is unavailable.`;
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
