import type {
    InvocationOperationKind,
    InvocationRefusal,
    InvocationResultFrame,
    InvokeResult,
} from '@haus/api';
import {
    computerOfflineText,
    goneComputerText,
    noAccessText,
    notFoundText,
    ranOnLine,
} from '../computer-access/access-refusal-text.ts';
import { readComputerFacts } from '../computer-access/computer-facts.ts';
import { desktopStoppedText, renderDesktopRefusal } from '../computer-use/computer-use-gate.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    keyOf,
    noticeAnswer,
    resultAnswer,
    textAnswer,
    withLeadLine,
} from './invocation-frames.ts';
import {
    type InvocationRecord,
    readAgentMachine,
    recordFinishedRefusal,
} from './invocation-store.ts';

const namedKinds = new Set<InvocationOperationKind>(['bash', 'browser', 'desktop', 'edit']);

export async function settledAnswer(
    db: HausDatabase,
    input: { appOrigin: string; candidates?: readonly string[]; record: InvocationRecord }
) {
    const { record } = input;
    const { outcome } = record;
    if (record.state !== 'finished' || outcome === null || outcome === 'unknown') {
        return noticeAnswer(keyOf(record), 'unknown', record.id);
    }
    if (record.refusal) {
        const text = await refusalText(db, { ...input, refusal: record.refusal });
        return textAnswer(record, outcome, text);
    }
    if (outcome === 'offline') {
        return await offlineAnswer(db, record);
    }
    return await namedOffHome(db, {
        answer: textAnswer(
            record,
            outcome,
            'This call already finished; its output was answered once.'
        ),
        record,
    });
}

export async function machineResultAnswer(
    db: HausDatabase,
    input: {
        appOrigin: string;
        fenced: boolean;
        homeComputerId: string | null | undefined;
        record: InvocationRecord;
        result: InvokeResult;
        stopped: boolean;
    }
) {
    const { record, result } = input;
    const refusal = refusalOf(input);
    if (refusal && record.state === 'finished') {
        await recordFinishedRefusal(db, record.id, refusal);
        return await settledAnswer(db, {
            appOrigin: input.appOrigin,
            record: { ...record, refusal },
        });
    }
    const answer = resultAnswer(record, result);
    if (input.stopped && record.operationKind === 'desktop' && result.outcome === 'cancelled') {
        const text = await desktopStoppedText(db, record);
        return { ...answer, output: { kind: 'text' as const, text } };
    }
    return result.outcome === 'unknown'
        ? answer
        : await namedOffHome(db, { answer, homeComputerId: input.homeComputerId, record });
}

export async function offlineAnswer(db: HausDatabase, record: InvocationRecord) {
    const computer = record.computerId
        ? await readComputerFacts(db, { computerId: record.computerId, serverId: record.serverId })
        : null;
    return computer
        ? textAnswer(record, 'offline', computerOfflineText(computer.name))
        : noticeAnswer(keyOf(record), 'offline', record.id);
}

async function refusalText(
    db: HausDatabase,
    input: {
        appOrigin: string;
        candidates?: readonly string[];
        record: InvocationRecord;
        refusal: InvocationRefusal;
    }
) {
    const { record, refusal } = input;
    if (refusal === 'not-found') {
        return notFoundText(input.candidates ?? []);
    }
    const { computerId } = record;
    if (!computerId) {
        return goneComputerText(refusal);
    }
    if (refusal === 'no-access') {
        const computer = await readComputerFacts(db, { computerId, serverId: record.serverId });
        return computer ? noAccessText(computer, input.appOrigin) : goneComputerText(refusal);
    }
    const text = await renderDesktopRefusal(db, {
        appOrigin: input.appOrigin,
        cause: refusal,
        subject: { ...record, computerId },
    });
    return text ?? goneComputerText(refusal);
}

async function namedOffHome(
    db: HausDatabase,
    input: {
        answer: InvocationResultFrame;
        homeComputerId?: string | null | undefined;
        record: InvocationRecord;
    }
) {
    const { answer, record } = input;
    const { computerId } = record;
    if (!computerId || answer.output.kind !== 'text' || !namedKinds.has(record.operationKind)) {
        return answer;
    }
    const home =
        input.homeComputerId === undefined
            ? ((await readAgentMachine(db, record.agentId))?.computerId ?? null)
            : input.homeComputerId;
    if (home === computerId) {
        return answer;
    }
    const computer = await readComputerFacts(db, { computerId, serverId: record.serverId });
    return withLeadLine(answer, ranOnLine(computer?.name ?? computerId));
}

function refusalOf(input: { fenced: boolean; record: InvocationRecord; result: InvokeResult }) {
    if (input.record.operationKind === 'desktop' && input.result.refusal) {
        return input.result.refusal;
    }
    return input.fenced && input.result.outcome === 'cancelled' ? ('no-access' as const) : null;
}
