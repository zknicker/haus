export interface ProcessRecord {
    command: string;
    cpuPercent: number;
    elapsedSeconds: number;
    parentPid: number;
    pid: number;
    rssBytes: number;
}

export type CdpProbeState = 'healthy' | 'unknown' | 'unreachable';

export interface CdpSnapshot {
    latencyMs: number | null;
    state: CdpProbeState;
}

export interface CdpAttachment {
    port: number;
    webSocketDebuggerUrl: string;
}

export interface ChromeApplication {
    executablePath: string;
    path: string;
    version: string | null;
}

export interface ProcessListReader {
    read(): Promise<ProcessRecord[]>;
}

export interface CdpProber {
    attachment(userDataDir: string): Promise<CdpAttachment>;
    probe(userDataDir: string): Promise<CdpSnapshot>;
}

export interface BrowserTarget {
    executablePath: string;
    userDataDir: string;
}
