import type { InvocationResultFrame } from '@haus/api';
import { readAgentsBarredFrom } from '../computer-access/agent-access.ts';
import type { ComputerConnections } from '../computers/connections.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { settledAnswer } from './invocation-answers.ts';
import { gateInvocation } from './invocation-gate.ts';
import { recordSentRefusal } from './invocation-store.ts';
import { type FenceTarget, markFenced, type OpenInvocation } from './open-invocations.ts';

interface ReattachInput {
    answer(frame: InvocationResultFrame): void;
    appOrigin: string;
    computers: Pick<ComputerConnections, 'isOnline' | 'send'>;
    db: HausDatabase;
    forget(invocationId: string): void;
    open: Map<string, OpenInvocation>;
    settleUnsent(invocationId: string, invocation: OpenInvocation): Promise<void>;
}

export function reattachInvocations(input: ReattachInput) {
    const { appOrigin, computers, db, open } = input;

    function fence(target: FenceTarget) {
        const fenced = markFenced(open, target);
        computers.send(target.computerId, { agentId: target.agentId, type: 'agent-fence' });
        if (!computers.isOnline(target.computerId)) {
            for (const [invocationId, invocation] of fenced) {
                if (!invocation.accepted) {
                    void input
                        .settleUnsent(invocationId, invocation)
                        .catch((error: unknown) =>
                            console.error('[haus] invocation fence failed', error)
                        );
                }
            }
        }
        return fenced.length;
    }

    async function fenceHeld(computerId: string) {
        for (const agent of await readAgentsBarredFrom(db, computerId)) {
            fence({ ...agent, computerId });
        }
    }

    async function reattach(computerId: string) {
        for (const [invocationId, invocation] of [...open]) {
            if (invocation.computerId !== computerId) {
                continue;
            }
            if (invocation.fenced && !invocation.accepted) {
                await input.settleUnsent(invocationId, invocation);
            } else if (invocation.runSettled || invocation.cancelled || invocation.fenced) {
                computers.send(computerId, { invocationId, type: 'invoke-cancel' });
            } else if (!invocation.accepted) {
                void resend(invocationId, invocation).catch((error: unknown) =>
                    console.error('[haus] invocation resend failed', error)
                );
            }
        }
    }

    async function resend(invocationId: string, invocation: OpenInvocation) {
        const verdict = await gateInvocation(db, {
            agentId: invocation.command.agentId,
            computerId: invocation.computerId,
            online: true,
            operation: invocation.command.operation,
            serverId: invocation.serverId,
        });
        if (open.get(invocationId) !== invocation || invocation.accepted) {
            return;
        }
        if (invocation.fenced || invocation.stopped) {
            await input.settleUnsent(invocationId, invocation);
            return;
        }
        if (verdict.kind === 'refuse') {
            input.forget(invocationId);
            computers.send(invocation.computerId, { invocationId, type: 'invoke-cancel' });
            const record = await recordSentRefusal(db, invocationId, verdict.refusal);
            if (record) {
                input.answer(await settledAnswer(db, { appOrigin, record }));
            }
            return;
        }
        if (!invocation.cancelled) {
            computers.send(invocation.computerId, invocation.command);
        }
    }

    return { fence, fenceHeld, reattach };
}
