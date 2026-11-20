import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { ConversationView, Submission, SubmissionId } from '@earendil-works/pi-durable';
import { liveOf } from './pi-events.ts';

const context = BACKGROUND_CONTEXT;

interface QueuedSteer {
    readonly placement: ReturnType<typeof Promise.withResolvers<boolean>>;
    readonly submission: Submission;
    readonly text: string;
}

export class PiTurnSteers {
    private readonly queued = new Map<SubmissionId, QueuedSteer>();
    private readonly placedInputs = new Set<SubmissionId>();
    private readonly withdrawn: string[] = [];
    private closed = false;

    track(submission: Submission, text: string) {
        if (this.placedInputs.has(submission.id)) {
            return Promise.resolve(true);
        }
        const steer: QueuedSteer = { placement: Promise.withResolvers(), submission, text };
        if (this.closed) {
            this.withdraw(steer);
        } else {
            this.queued.set(submission.id, steer);
        }
        return steer.placement.promise;
    }

    observe(view: ConversationView) {
        const live = liveOf(view);
        for (const id of [...(live.run?.inputs ?? []), ...(live.runFailure?.inputs ?? [])]) {
            this.placedInputs.add(id);
            this.queued.get(id)?.placement.resolve(true);
            this.queued.delete(id);
        }
    }

    async close() {
        this.closed = true;
        const remaining = [...this.queued.values()];
        this.queued.clear();
        for (const steer of remaining) {
            await this.withdraw(steer);
        }
    }

    unconsumed() {
        return [...this.withdrawn];
    }

    private async withdraw(steer: QueuedSteer) {
        const placed = await wasPlaced(steer.submission);
        if (!placed) {
            this.withdrawn.push(steer.text);
        }
        steer.placement.resolve(placed);
    }
}

async function wasPlaced(submission: Submission) {
    try {
        const answer = await submission.abort(context);
        if (answer !== 'settled') {
            return answer === 'already_placed';
        }
        return (await submission.status(context)).entry !== undefined;
    } catch {
        return false;
    }
}
