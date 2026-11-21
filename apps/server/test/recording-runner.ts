import type { RunnerDownFrame } from '@haus/api';
import type { RunnerWire } from '../src/agent-delivery/loop-host.ts';

export class RecordingRunner implements RunnerWire {
    readonly sent: RunnerDownFrame[] = [];
    private agentIds: ReadonlySet<string> = new Set();
    private online = false;

    attach(...agentIds: string[]) {
        this.online = true;
        this.agentIds = new Set(agentIds);
    }

    detach() {
        this.online = false;
    }

    isOnline() {
        return this.online;
    }

    send(frame: RunnerDownFrame) {
        const agentId = agentIdOf(frame);
        if (!(this.online && agentId && this.agentIds.has(agentId))) {
            return false;
        }
        this.sent.push(frame);
        return true;
    }

    framesOfType<T extends RunnerDownFrame['type']>(type: T) {
        return this.sent.filter(
            (frame): frame is Extract<RunnerDownFrame, { type: T }> => frame.type === type
        );
    }

    starts() {
        return this.framesOfType('runner-start').map((frame) => frame.start);
    }

    startFrames() {
        return this.framesOfType('runner-start');
    }
}

function agentIdOf(frame: RunnerDownFrame) {
    if (frame.type === 'runner-start') {
        return frame.start.agentId;
    }
    return 'agentId' in frame ? frame.agentId : null;
}
