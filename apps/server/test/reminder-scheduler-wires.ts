import type { AgentCommand } from '@haus/api';
import { AgentDelivery, type DeliveryTransport } from '../src/agent-delivery/delivery.ts';
import type { HausConnection } from '../src/postgres/connection.ts';
import { RecordingRunner } from './recording-runner.ts';

class RecordingTransport implements DeliveryTransport {
    readonly frames: AgentCommand[] = [];
    online = true;

    isOnline(computerId: string) {
        return this.online && computerId === 'cmp_ssssssssssssssss';
    }

    send(computerId: string, frame: AgentCommand) {
        if (!this.isOnline(computerId)) {
            return false;
        }
        this.frames.push(frame);
        return true;
    }
}

export function recordingWires(haus: HausConnection) {
    const transport = new RecordingTransport();
    const runner = new RecordingRunner();
    const delivery = new AgentDelivery(haus.db, transport, undefined, runner);
    return { delivery, runner, transport };
}
