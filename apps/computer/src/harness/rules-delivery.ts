import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { planRulesDelivery, type RuleFile, ruleLayerPaths } from '@haus/agent-prompt';

export interface RulesDelivery {
    block: string | null;
    known: boolean;
    priorReceipts: Readonly<Record<string, string>>;
    readPaths: readonly string[];
}

export async function planRulesTurnDelivery(input: {
    driveFolder: string;
    handle: string;
    isResume: boolean;
    receipts: Readonly<Record<string, string>>;
    wake: boolean;
}) {
    const files = await readRuleFiles(input.driveFolder, input.handle);
    const readPaths = files.map((file) => file.path);
    const plan = planRulesDelivery({
        files,
        isResume: input.isResume,
        receipts: input.receipts,
    });
    if (input.wake && plan.block) {
        const deferred: RulesDelivery = {
            block: null,
            known: false,
            priorReceipts: plan.priorReceipts,
            readPaths,
        };
        return deferred;
    }
    const delivery: RulesDelivery = {
        block: plan.block,
        known: true,
        priorReceipts: plan.priorReceipts,
        readPaths,
    };
    return delivery;
}

export function withRules(delivery: RulesDelivery, prompt: string) {
    return delivery.block ? `${delivery.block}\n\n${prompt}` : prompt;
}

export async function readRuleDigests(
    driveFolder: string,
    handle: string,
    priorReceipts: Readonly<Record<string, string>>
) {
    return planRulesDelivery({
        files: await readRuleFiles(driveFolder, handle),
        isResume: true,
        receipts: priorReceipts,
    }).digests;
}

export function ruleReceiptsAfterTurn(
    delivery: RulesDelivery,
    turn: { compacted: boolean; completed: boolean; endDigests: Readonly<Record<string, string>> }
) {
    if (turn.compacted) {
        return {};
    }
    if (!(turn.completed && delivery.known)) {
        return delivery.priorReceipts;
    }
    const wasRead = ([path]: [string, string]) => delivery.readPaths.includes(path);
    return Object.fromEntries([
        ...Object.entries(delivery.priorReceipts).filter((entry) => !wasRead(entry)),
        ...Object.entries(turn.endDigests).filter(wasRead),
    ]);
}

async function readRuleFiles(driveFolder: string, handle: string) {
    const files = await Promise.all(
        ruleLayerPaths(handle).map((path) => readRuleFile(driveFolder, path))
    );
    return files.filter((file): file is RuleFile => file !== null);
}

async function readRuleFile(driveFolder: string, path: string) {
    try {
        const file: RuleFile = { content: await readFile(join(driveFolder, path), 'utf8'), path };
        return file;
    } catch (error) {
        const code = (error as NodeJS.ErrnoException | null)?.code;
        if (code === 'ENOENT' || code === 'ENOTDIR') {
            const deleted: RuleFile = { content: null, path };
            return deleted;
        }
        process.stderr.write(
            `${path} is unreadable (${code ?? String(error)}); delivering none.\n`
        );
        return null;
    }
}
