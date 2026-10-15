import {
    type WorkspaceDisk,
    type WorkspaceHolder,
    WorkspaceVolumeBusyError,
} from './disk-image.ts';

/**
 * What to do when a volume stays busy after the holder wait and every retry:
 * `force` yanks it (only for a volume whose Agent is gone), `fail` leaves it mounted.
 */
export type BusyVolumePolicy = 'fail' | 'force';
export type DetachOutcome =
    | { kind: 'detached'; attempts: number }
    | { kind: 'forced'; attempts: number; holders: WorkspaceHolder[] };
export interface DetachPacing {
    /** Delays between plain detach attempts; attempts = backoffMs.length + 1. */
    backoffMs: readonly number[];
    holderPollMs: number;
    /** Polls of the holder list while the stopped session's processes exit. */
    holderPolls: number;
    sleep(ms: number): Promise<void>;
}

export const defaultDetachPacing: DetachPacing = {
    backoffMs: [250, 500, 1000, 2000],
    holderPollMs: 250,
    holderPolls: 40,
    sleep: (ms) => Bun.sleep(ms),
};

/** Shutdown already stopped every session; keep a busy volume's wait short and leave it. */
export const shutdownDetachPacing: DetachPacing = {
    ...defaultDetachPacing,
    backoffMs: [250, 500],
    holderPolls: 8,
};

export class WorkspaceDetachError extends Error {
    constructor(
        readonly mountpoint: string,
        readonly holders: WorkspaceHolder[],
        options: { cause: unknown }
    ) {
        super(
            `Workspace volume ${mountpoint} stayed busy and is still mounted (holders: ${describeHolders(holders)}).`,
            options
        );
        this.name = 'WorkspaceDetachError';
    }
}

/**
 * Detaches a workspace volume after its processes exit. A stopped runtime session's
 * process tree can outlive the stop call by a moment, so wait for the volume's holders
 * to drain, retry a plain detach with backoff, and force only as a logged last resort.
 */
export async function detachWorkspaceVolume(input: {
    disk: WorkspaceDisk;
    mountpoint: string;
    onBusy: BusyVolumePolicy;
    pacing?: DetachPacing;
}): Promise<DetachOutcome> {
    const { disk, mountpoint } = input;
    const pacing = input.pacing ?? defaultDetachPacing;
    await waitForHolders(disk, mountpoint, pacing);
    let lastBusy: WorkspaceVolumeBusyError | null = null;
    const attempts = pacing.backoffMs.length + 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            await disk.detach(mountpoint);
            return { attempts: attempt, kind: 'detached' };
        } catch (error) {
            if (!(error instanceof WorkspaceVolumeBusyError)) {
                throw error;
            }
            lastBusy = error;
        }
        const delay = pacing.backoffMs[attempt - 1];
        if (delay !== undefined) {
            await pacing.sleep(delay);
        }
    }
    const holders = await disk.holders(mountpoint);
    if (input.onBusy === 'fail') {
        throw new WorkspaceDetachError(mountpoint, holders, { cause: lastBusy });
    }
    console.warn(
        `Forcing detach of workspace volume ${mountpoint}: still busy after ${attempts} attempts; its Agent is gone. Holders: ${describeHolders(holders)}.`
    );
    try {
        await disk.detach(mountpoint, { force: true });
    } catch (error) {
        throw new WorkspaceDetachError(mountpoint, holders, { cause: error });
    }
    return { attempts, holders, kind: 'forced' };
}

export function describeHolders(holders: readonly WorkspaceHolder[]): string {
    return holders.length === 0
        ? 'none reported'
        : holders.map((holder) => `${holder.command || '?'}[${holder.pid}]`).join(', ');
}

async function waitForHolders(disk: WorkspaceDisk, mountpoint: string, pacing: DetachPacing) {
    for (let poll = 0; poll < pacing.holderPolls; poll++) {
        if ((await disk.holders(mountpoint)).length === 0) {
            return;
        }
        await pacing.sleep(pacing.holderPollMs);
    }
}
