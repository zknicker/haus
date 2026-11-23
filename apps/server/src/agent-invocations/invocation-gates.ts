import type { DispatchKey, InvocationOperation } from '@haus/api';
import { gateDesktopInvocation } from '../computer-use/computer-use-gate.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { gateRepoCheckout } from '../repos/repo-checkout-gate.ts';

export async function gateInvocation(
    db: HausDatabase,
    input: {
        agentId: string;
        appOrigin: string;
        computerId: string | null;
        invocationId: string;
        key: DispatchKey & { agentId: string };
        online: boolean;
        operation: InvocationOperation;
        serverId: string;
    }
) {
    const refusal = input.computerId
        ? await gateDesktopInvocation(db, { ...input, computerId: input.computerId })
        : null;
    return refusal
        ? { answer: refusal, kind: 'refused' as const }
        : await gateRepoCheckout(db, input);
}
