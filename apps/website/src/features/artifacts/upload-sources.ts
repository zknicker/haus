import type { UploadSource } from './upload-plan.ts';

/**
 * Files from a file input. A folder pick (`webkitdirectory`) names each file
 * by its path inside the picked folder, folder name first, so the folder
 * lands as itself.
 */
export function inputUploadSources(files: Iterable<File>): UploadSource<File>[] {
    return [...files].map((file) => ({
        file,
        relativePath: file.webkitRelativePath || file.name,
    }));
}

/**
 * Files from a drop, walking dropped folders so their structure survives.
 * Entries must be taken synchronously inside the drop event; the walk itself
 * is async. Browsers without the entries API fall back to the flat file list.
 */
export function dropUploadSources(transfer: DataTransfer): Promise<UploadSource<File>[]> {
    const entries = [...transfer.items]
        .filter((item) => item.kind === 'file')
        .map((item) => item.webkitGetAsEntry?.() ?? null);
    if (entries.length === 0 || entries.some((entry) => entry === null)) {
        return Promise.resolve(inputUploadSources(transfer.files));
    }
    return walkEntries(entries as FileSystemEntry[], '');
}

async function walkEntries(
    entries: readonly FileSystemEntry[],
    parent: string
): Promise<UploadSource<File>[]> {
    const sources: UploadSource<File>[] = [];
    for (const entry of entries) {
        const relativePath = parent ? `${parent}/${entry.name}` : entry.name;
        if (isFileEntry(entry)) {
            sources.push({ file: await entryFile(entry), relativePath });
        } else if (isDirectoryEntry(entry)) {
            sources.push(...(await walkEntries(await directoryEntries(entry), relativePath)));
        }
    }
    return sources;
}

function isFileEntry(entry: FileSystemEntry): entry is FileSystemFileEntry {
    return entry.isFile;
}

function isDirectoryEntry(entry: FileSystemEntry): entry is FileSystemDirectoryEntry {
    return entry.isDirectory;
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
    return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** `readEntries` hands back a batch at a time (about 100 in Chromium) until it returns none. */
async function directoryEntries(entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
    const reader = entry.createReader();
    const all: FileSystemEntry[] = [];
    for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
            reader.readEntries(resolve, reject)
        );
        if (batch.length === 0) {
            return all;
        }
        all.push(...batch);
    }
}
