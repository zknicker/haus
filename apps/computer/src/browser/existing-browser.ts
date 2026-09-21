import type { AgentRuntimeBrowserStatus } from '@haus/api';
import { SystemCdpProber } from './cdp-probe.ts';
import { SystemProcessList } from './chrome-processes.ts';
import { chromeUserDataDir } from './discovery.ts';
import type { BrowserTarget, CdpProber, ProcessListReader } from './types.ts';

/** Observes an external browser. It has no process or profile mutation capability. */
export class ExistingBrowserConnection {
    constructor(
        private readonly contract: BrowserTarget,
        private readonly browserVersion: string | null,
        private readonly processes: ProcessListReader = new SystemProcessList(),
        private readonly cdp: CdpProber = new SystemCdpProber()
    ) {}

    async status(): Promise<AgentRuntimeBrowserStatus> {
        const records = await this.processes.read();
        const process = records.find(
            (record) =>
                !record.command.includes('--type=') &&
                record.command.startsWith(`${this.contract.executablePath} `) &&
                chromeUserDataDir(record.command) === this.contract.userDataDir &&
                record.command.includes('--remote-debugging-port=0')
        );
        const cdp = process
            ? await this.cdp.probe(this.contract.userDataDir)
            : { state: 'unreachable' as const };
        const healthy = cdp.state === 'healthy';
        return {
            browserVersion: this.browserVersion,
            cdpState: cdp.state,
            checkedAt: new Date().toISOString(),
            pid: process?.pid ?? null,
            reason: healthy
                ? null
                : 'The existing browser is unavailable. Its owner must start or recover it.',
            running: Boolean(process),
            state: healthy ? 'healthy' : 'degraded',
            uptimeSeconds: process?.elapsedSeconds ?? null,
        };
    }
}
