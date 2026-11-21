import type { RunnerDownFrame, RunnerInventoryFrame, RunnerRuntimeSettingsFrame } from '@haus/api';
import { DispatchedTurnTraces } from './dispatched-turn-traces.ts';

export interface RunnerAttachment {
    close(code: number, reason: string): void;
    isOpen(): boolean;
    send(frame: RunnerDownFrame): void;
}

export class RunnerLink {
    readonly dispatchedTraces = new DispatchedTurnTraces();
    private attached: RunnerAttachment | null = null;
    private reportedInventory: RunnerInventoryFrame | null = null;
    private settingsSends: Promise<void> = Promise.resolve();

    get inventory() {
        return this.reportedInventory;
    }

    attach(attachment: RunnerAttachment) {
        const replaced = this.attached;
        this.attached = attachment;
        replaced?.close(4409, 'A newer runner attached.');
    }

    detach(attachment: RunnerAttachment) {
        if (this.attached === attachment) {
            this.attached = null;
        }
    }

    isAttached(attachment: RunnerAttachment) {
        return this.attached === attachment;
    }

    isOnline() {
        return this.attached?.isOpen() ?? false;
    }

    recordInventory(frame: RunnerInventoryFrame) {
        this.reportedInventory = frame;
    }

    sendRuntimeSettings(read: () => Promise<RunnerRuntimeSettingsFrame>) {
        const run = this.settingsSends.then(async () => {
            this.send(await read());
        });
        this.settingsSends = run.then(
            () => undefined,
            () => undefined
        );
        return run;
    }

    send(frame: RunnerDownFrame) {
        const attachment = this.attached;
        if (!attachment?.isOpen()) {
            return false;
        }
        attachment.send(frame);
        if (frame.type === 'runner-start') {
            this.dispatchedTraces.record(frame);
        }
        return true;
    }
}
