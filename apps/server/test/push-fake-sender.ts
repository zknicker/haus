import type { PushOutcome, PushRequest, PushSender } from '../src/push/push-sender.ts';

/**
 * Records every push instead of calling APNs. A token can be told to answer
 * with a specific outcome; everything else is delivered.
 */
export class FakePushSender implements PushSender {
    readonly outcomes = new Map<string, PushOutcome>();
    readonly sent: PushRequest[] = [];

    close(): Promise<void> {
        return Promise.resolve();
    }

    send(request: PushRequest): Promise<PushOutcome> {
        this.sent.push(request);
        return Promise.resolve(this.outcomes.get(request.device.token) ?? { kind: 'delivered' });
    }

    /** Pushes about one message, after its (async, post-commit) sends settle. */
    async sentFor(messageId: string, expected: number): Promise<PushRequest[]> {
        const deadline = Date.now() + 5000;
        while (this.matching(messageId).length < expected && Date.now() < deadline) {
            await Bun.sleep(20);
        }
        // Long enough for any extra, wrongly addressed push to land too.
        await Bun.sleep(150);
        return this.matching(messageId);
    }

    private matching(messageId: string) {
        return this.sent.filter((request) => request.collapseId === messageId);
    }
}

export function deviceToken(seed: string) {
    return seed.repeat(64).slice(0, 64);
}
