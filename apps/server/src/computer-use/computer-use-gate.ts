import type {
    DispatchKey,
    InvocationOperation,
    InvocationResultFrame,
    InvokeResult,
    ScreenRefusal,
} from '@haus/api';
import { resultAnswer } from '../agent-invocations/invocation-answers.ts';
import type { InvocationRecord } from '../agent-invocations/invocation-store.ts';
import {
    recordDesktopRefusal,
    recordScreenRefusal,
} from '../agent-invocations/invocation-store.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    type DesktopGateInput,
    desktopGateCause,
    desktopRefusalFacts,
    readDesktopDevice,
    readDesktopDeviceName,
} from './desktop-device.ts';
import { desktopRefusalText } from './desktop-refusal-text.ts';

type AnswerKey = DispatchKey & { agentId: string };

export async function gateDesktopInvocation(
    db: HausDatabase,
    input: Omit<DesktopGateInput, 'runId'> & { key: AnswerKey; operation: InvocationOperation }
) {
    if (input.operation.kind !== 'desktop') {
        return null;
    }
    const gate = { ...input, runId: input.key.runId };
    const device = await readDesktopDevice(db, gate);
    const cause = device ? desktopGateCause(device, input.online) : null;
    if (!(device && cause)) {
        return null;
    }
    const facts = await desktopRefusalFacts(db, gate, device, cause);
    const outcome = await recordDesktopRefusal(db, input.invocationId, cause);
    return outcome
        ? refusalFrame(input.key, input.invocationId, outcome, desktopRefusalText(facts))
        : null;
}

export async function desktopResultAnswer(
    db: HausDatabase,
    input: { appOrigin: string; record: InvocationRecord; result: InvokeResult; stopped: boolean }
) {
    const answered = resultAnswer(input.record, input.result);
    if (input.record.operationKind !== 'desktop') {
        return answered;
    }
    const { refusal } = input.result;
    const text = refusal
        ? await screenRefusalText(db, { ...input, refusal })
        : input.stopped && input.result.outcome === 'cancelled'
          ? desktopStoppedText(await readDesktopDeviceName(db, input.record))
          : null;
    return text ? { ...answered, output: { kind: 'text' as const, text } } : answered;
}

async function screenRefusalText(
    db: HausDatabase,
    input: { appOrigin: string; record: InvocationRecord; refusal: ScreenRefusal }
) {
    const { record } = input;
    if (!record.computerId) {
        return null;
    }
    const gate = {
        agentId: record.agentId,
        appOrigin: input.appOrigin,
        computerId: record.computerId,
        invocationId: record.id,
        online: true,
        runId: record.runId,
        serverId: record.serverId,
    };
    const device = await readDesktopDevice(db, gate);
    if (!device) {
        return null;
    }
    const facts = await desktopRefusalFacts(db, gate, device, input.refusal);
    await recordScreenRefusal(db, record.id, input.refusal);
    return desktopRefusalText(facts);
}

function desktopStoppedText(device: string) {
    return `A person stopped agent input on ${device} from Haus, so this command was cancelled. Stop using \`desktop\` there and tell the person what you were doing.`;
}

function refusalFrame(
    key: AnswerKey,
    invocationId: string,
    outcome: 'failed' | 'offline',
    text: string
) {
    const answer: InvocationResultFrame = {
        agentId: key.agentId,
        invocationId,
        outcome,
        output: { kind: 'text', text },
        runId: key.runId,
        seq: key.seq,
        toolCallId: key.toolCallId,
        truncated: false,
        type: 'invocation-result',
    };
    return answer;
}
