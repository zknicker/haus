import type { WatchEnd } from '@earendil-works/chord/watch';
import type { RunFailure } from '@earendil-works/pi-durable';
import type { TurnEvent } from '../turn/turn-event.ts';

export function runFailureEvent(failure: RunFailure) {
    const detail = failure.detail ?? failure.reason;
    const event: TurnEvent =
        failure.reason === 'model_error' && accessFailure.test(detail)
            ? { category: 'access', severity: 'error', title: detail, type: 'session-failure' }
            : { error: new PiRunFailedError(failure), type: 'error' };
    return event;
}

export class PiRunFailedError extends Error {
    readonly reason: RunFailure['reason'];

    constructor(failure: RunFailure) {
        super(
            `The Pi run ended without an answer (${failure.reason})${failure.detail ? `: ${failure.detail}` : '.'}`
        );
        this.name = 'PiRunFailedError';
        this.reason = failure.reason;
    }
}

export class PiSessionEndedError extends Error {
    constructor(end: WatchEnd) {
        const cause = 'error' in end ? end.error : undefined;
        super(`The Pi session ended before the turn finished (${end.kind}).`, { cause });
        this.name = 'PiSessionEndedError';
    }
}

const accessFailure =
    /\b(?:401|403)\b|unauthori[sz]ed|forbidden|invalid api key|not signed in|login/iu;
