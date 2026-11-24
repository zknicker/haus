import { createHash } from 'node:crypto';
import { formatRulesBlock, type RulesChange } from './rules-block.ts';

export type RuleFile = RulesChange;

/** The rule layers a main session receives, by Drive path (ADR 0054 decision 7). */
export function ruleLayerPaths(agent: { handle: string; projectKey: string | null }) {
    return [
        'haus/AGENTS.md',
        ...(agent.projectKey === null ? [] : [`projects/${agent.projectKey}/AGENTS.md`]),
        `agents/${agent.handle}/AGENTS.md`,
    ];
}

/**
 * The turn's rules block and the receipts a completed turn leaves. A file whose digest differs
 * from the receipt is carried; a deleted file with a receipt is announced once; a file the reader
 * could not read keeps its receipt.
 */
export function planRulesDelivery(input: {
    files: readonly RuleFile[];
    isResume: boolean;
    receipts: Readonly<Record<string, string>>;
}) {
    const priorReceipts = input.isResume ? input.receipts : {};
    const current = input.files.map((file) => ({
        ...file,
        digest: file.content === null ? null : sha256(file.content),
    }));
    const changes = current.filter((file) =>
        file.digest === null
            ? Object.hasOwn(priorReceipts, file.path)
            : priorReceipts[file.path] !== file.digest
    );
    const unread = Object.entries(priorReceipts).filter(
        ([path]) => !current.some((file) => file.path === path)
    );
    const digests: Record<string, string> = Object.fromEntries([
        ...unread,
        ...current.flatMap((file) => (file.digest === null ? [] : [[file.path, file.digest]])),
    ]);
    return { block: formatRulesBlock(changes), digests, priorReceipts };
}

function sha256(text: string) {
    return createHash('sha256').update(text).digest('hex');
}
