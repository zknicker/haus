import type { RunnerStartFrame } from '@haus/api';
import { parseTraceCarrier } from '@haus/effect';

const windowMs = 6 * 60 * 60 * 1000;
const capacity = 10_000;
const sampledFlag = 1;

interface DispatchedTurnTrace {
    readonly agentId: string;
    readonly parentSpanId: string;
    readonly recordedAtMs: number;
    readonly sampled: boolean;
    readonly serverId: string;
    readonly traceId: string;
}

export class DispatchedTurnTraces {
    private readonly runs = new Map<string, DispatchedTurnTrace>();

    constructor(private readonly now: () => number = Date.now) {}

    record(frame: RunnerStartFrame) {
        const { agentId, runId, traceContext } = frame.start;
        const context = traceContext ? parseTraceCarrier(traceContext) : null;
        this.evictExpired();
        if (!context || this.runs.has(runId)) {
            return;
        }
        this.runs.set(runId, {
            agentId,
            parentSpanId: context.spanId,
            recordedAtMs: this.now(),
            sampled: (context.traceFlags & sampledFlag) === sampledFlag,
            serverId: frame.serverId,
            traceId: context.traceId,
        });
        const oldest = this.runs.keys().next();
        if (this.runs.size > capacity && !oldest.done) {
            this.runs.delete(oldest.value);
        }
    }

    claim(span: { readonly agentId: string; readonly runId: string; readonly serverId: string }) {
        this.evictExpired();
        const run = this.runs.get(span.runId);
        if (!run || run.agentId !== span.agentId || run.serverId !== span.serverId) {
            return null;
        }
        this.runs.delete(span.runId);
        return run;
    }

    private evictExpired() {
        const cutoff = this.now() - windowMs;
        for (const [runId, run] of this.runs) {
            if (run.recordedAtMs > cutoff) {
                return;
            }
            this.runs.delete(runId);
        }
    }
}
