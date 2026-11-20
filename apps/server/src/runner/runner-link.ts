import type { RunnerDownFrame, RunnerInventoryFrame } from '@haus/api';

export interface RunnerAttachment {
    close(code: number, reason: string): void;
    isOpen(): boolean;
    send(frame: RunnerDownFrame): void;
}

export class RunnerLink {
    private attached: RunnerAttachment | null = null;
    private reportedInventory: RunnerInventoryFrame | null = null;

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

    send(frame: RunnerDownFrame) {
        const attachment = this.attached;
        if (!attachment?.isOpen()) {
            return false;
        }
        attachment.send(frame);
        return true;
    }
}
