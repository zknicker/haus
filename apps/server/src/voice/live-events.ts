import { z } from 'zod';

const transcript = z.object({
    delta: z.string(),
    start_ms: z.number().optional(),
    end_ms: z.number().optional(),
});
export const liveEventSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('session.started') }),
    z.object({ type: z.literal('session.closed') }),
    z.object({ type: z.literal('session.output_audio.delta'), delta: z.string() }),
    transcript.extend({ type: z.literal('session.input_transcript.delta') }),
    transcript.extend({ type: z.literal('session.output_transcript.delta') }),
    z.object({
        type: z.literal('session.delegation.created'),
        delegation: z.object({ id: z.string(), target: z.literal('client') }),
    }),
    z.object({
        type: z.literal('error'),
        error: z.object({ message: z.string(), code: z.string().nullish() }),
    }),
]);

/** Delegation can precede transcription; retain it until caller text settles. */
export class VoiceDelegations {
    private text = '';
    private readonly pending = new Set<string>();
    private readonly seen = new Set<string>();
    private changedAt = 0;

    append(text: string, now: number) {
        if (this.text.length + text.length > 16_000) {
            throw new Error('The spoken request is too long. Start a new call.');
        }
        this.text += text;
        this.changedAt = now;
    }

    request(id: string) {
        if (this.seen.has(id)) {
            return;
        }
        if (this.seen.size >= 200) {
            throw new Error('The call reached its request limit. Start a new call.');
        }
        this.seen.add(id);
        this.pending.add(id);
    }

    take(now: number) {
        if (!(this.pending.size && this.text.trim()) || now - this.changedAt < 800) {
            return null;
        }
        const ids = [...this.pending];
        const text = this.text.trim();
        this.text = '';
        this.pending.clear();
        return { id: ids[0]!, text };
    }
}
