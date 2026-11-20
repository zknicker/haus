import type { AgentDrive } from '../drive/agent-drive.ts';
import {
    type MemoryDelivery,
    planMemoryDelivery,
    readMemoryDigest,
    withMemory,
} from './memory-delivery.ts';
import {
    planRulesTurnDelivery,
    type RulesDelivery,
    readRuleDigests,
    withRules,
} from './rules-delivery.ts';
import type { AgentSessionState } from './session-store.ts';

export async function planTurnFiles(input: {
    drive: AgentDrive;
    isResume: boolean;
    session: AgentSessionState;
    wake: boolean;
}) {
    const [memory, rules] = await Promise.all([
        planMemoryDelivery({
            isResume: input.isResume,
            memoryPath: input.drive.memory,
            receipt: input.session.deliveredMemoryDigest,
            wake: input.wake,
        }),
        planRulesTurnDelivery({
            driveFolder: input.drive.folder,
            handle: input.drive.handle,
            isResume: input.isResume,
            receipts: input.session.deliveredRuleDigests,
            wake: input.wake,
        }),
    ]);
    return { memory, rules };
}

export function withTurnFiles(
    files: { memory: MemoryDelivery; rules: RulesDelivery },
    prompt: string
) {
    return withRules(files.rules, withMemory(files.memory, prompt));
}

export async function readTurnFileDigests(drive: AgentDrive, rules: RulesDelivery) {
    const [memoryDigest, ruleDigests] = await Promise.all([
        readMemoryDigest(drive.memory),
        readRuleDigests(drive.folder, drive.handle, rules.priorReceipts),
    ]);
    return { memoryDigest, ruleDigests };
}
