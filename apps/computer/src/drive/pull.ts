import type { DriveAreaCounters } from '@haus/api';
import type { DriveRemote } from './drive-remote.ts';
import { folderFiles } from './folder-files.ts';
import {
    type DriveFolderArea,
    type DriveFolderLayout,
    isReadOnlyArea,
    openFolderState,
} from './folder-state.ts';
import { applyChange, type ChangeResult } from './pull-change.ts';

export async function pullDrive(input: { layout: DriveFolderLayout; remote: DriveRemote }) {
    const state = await openFolderState(input.layout);
    const files = folderFiles(input.layout);
    const tally: Record<ChangeResult, number> = { applied: 0, blocked: 0, kept: 0, skipped: 0 };
    let since: DriveAreaCounters = { ...state.current().counters };
    let until: DriveAreaCounters | undefined;
    let areas: DriveFolderArea[] = state.current().areas;
    await files.clearScratch();
    try {
        for (;;) {
            const page = await input.remote.changes(since, until);
            until ??= page.until;
            areas = page.areas.map(({ area, root }) => ({ area, root }));
            for (const change of page.changes) {
                const readOnlyRoot = readOnlyRootOf(areas, change.area, input.layout.writer);
                tally[await applyChange({ ...input, files, readOnlyRoot, state }, change)] += 1;
                since = { ...since, [change.area]: change.sequence };
            }
            if (page.complete) {
                break;
            }
        }
        if (tally.blocked === 0) {
            await state.advance(areas, until);
        }
    } finally {
        await files.relock();
    }
    return { ...tally, advanced: tally.blocked === 0 };
}

function readOnlyRootOf(areas: readonly DriveFolderArea[], area: string, writer: string) {
    return isReadOnlyArea(area, writer)
        ? (areas.find((candidate) => candidate.area === area)?.root ?? null)
        : null;
}
