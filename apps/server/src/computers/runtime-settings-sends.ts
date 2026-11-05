import type { AgentCommand, ServerRuntimeSettingsCommand } from '@haus/api';

type ReadSettings = () => Promise<ServerRuntimeSettingsCommand>;

interface SettingsTransport {
    send(computerId: string, frame: AgentCommand): boolean;
    sendToServer(serverId: string, frame: AgentCommand): number;
}

/**
 * Orders every `server-runtime-settings` send of one Server. Each send reads the stored settings
 * inside a per-Server queue, so an attach read that started before a change can never reach a
 * Computer after that change's frame (specs/runtime-drivers.md "Idle compaction").
 */
export class RuntimeSettingsSends {
    private readonly queues = new Map<string, Promise<void>>();

    constructor(private readonly transport: SettingsTransport) {}

    /** A Computer attached. It holds every setting off, so it hears them only while one is on. */
    attached(serverId: string, computerId: string, read: ReadSettings): Promise<void> {
        return this.enqueue(serverId, async () => {
            const settings = await read();
            if (settings.idleCompaction) {
                this.transport.send(computerId, settings);
            }
        });
    }

    /** A setting changed: every attached Computer of the Server gets the stored settings. */
    changed(serverId: string, read: ReadSettings): Promise<void> {
        return this.enqueue(serverId, async () => {
            this.transport.sendToServer(serverId, await read());
        });
    }

    private enqueue(serverId: string, job: () => Promise<void>): Promise<void> {
        const run = (this.queues.get(serverId) ?? Promise.resolve()).then(job);
        // The next send waits for this one either way; its caller sees its failure.
        const settled = run.then(
            () => undefined,
            () => undefined
        );
        this.queues.set(serverId, settled);
        void settled.then(() => {
            if (this.queues.get(serverId) === settled) {
                this.queues.delete(serverId);
            }
        });
        return run;
    }
}
