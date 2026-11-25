import type { FolderFiles } from './folder-files.ts';
import { SymlinkedFolderError } from './folder-spelling.ts';
import type { DrivePlacement, FolderStateStore } from './folder-state.ts';
import type { FileStamp } from './folder-walk.ts';

interface PlacingContext {
    files: FolderFiles;
    state: FolderStateStore;
}

export async function placeJournaled(
    context: PlacingContext,
    placement: DrivePlacement,
    source: string,
    lock: string | null,
    expected: FileStamp | null
) {
    const { files, state } = context;
    await state.notePlacing(placement);
    const mtimeMs = await files.placeIfUnchanged(placement.path, source, lock, expected);
    if (mtimeMs === null) {
        await state.dropPlacing(placement.path);
        return null;
    }
    await state.record({ ...placement, mtime_ms: mtimeMs });
    return mtimeMs;
}

export async function settlePlacing(context: PlacingContext) {
    const { files, state } = context;
    for (const placement of Object.values(state.current().placing)) {
        const local = await files.inspect(placement.path).catch((error: unknown) => {
            if (error instanceof SymlinkedFolderError) {
                return null;
            }
            throw error;
        });
        if (local !== null && typeof local === 'object' && local.sha256 === placement.sha256) {
            await state.record({ ...placement, mtime_ms: local.mtimeMs });
        } else {
            await state.dropPlacing(placement.path);
        }
    }
}
