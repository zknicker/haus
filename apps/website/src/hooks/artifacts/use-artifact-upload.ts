import { artifactListPageMax, artifactPathKey } from '@haus/api';
import { toast } from '@heroui/react';
import * as React from 'react';
import {
    type PlannedUpload,
    planArtifactUpload,
    type RejectedUpload,
    skipUnchangedReplacements,
    type UploadPlan,
    type UploadSource,
} from '../../features/artifacts/upload-plan.ts';
import { getAppSessionAccessToken } from '../../lib/app-auth.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { ArtifactUploadCancelled, publishArtifactFile } from './publish-artifact-file.ts';
import { uploadDigests } from './upload-digests.ts';

export interface ArtifactUploadProgress {
    doneFiles: number;
    failures: RejectedUpload[];
    sentBytes: number;
    totalBytes: number;
    totalFiles: number;
    /** Picked files whose bytes already were the current revision. */
    unchangedFiles: number;
    uploadedFiles: number;
}

export type ArtifactUploadState =
    | { phase: 'idle' }
    | { phase: 'planning' }
    | { phase: 'confirm'; plan: UploadPlan<File> }
    | { phase: 'uploading' | 'done'; progress: ArtifactUploadProgress };

type QueuedUpload = PlannedUpload<File> & { replace: boolean };

const concurrency = 3;

/**
 * Human uploads into one drive folder. Plans against the files already under
 * the folder, skips files whose bytes match the current revision, asks once
 * when some would be replaced, then publishes a few files at a time through
 * the member route, refreshing the library at the end. A stalled file fails
 * on its own (`artifactUploadStallMs`); Cancel stops the rest. Refused paths
 * and failed files stay listed until dismissed.
 */
export function useArtifactUpload(serverId: string) {
    const utils = hausTrpc.useUtils();
    const [state, setState] = React.useState<ArtifactUploadState>({ phase: 'idle' });
    const controller = React.useRef<AbortController | null>(null);
    const busy = state.phase === 'planning' || state.phase === 'uploading';

    /** The drive's current digest of every file under the folder, by path key. */
    async function existingFiles(folder: string): Promise<Map<string, string>> {
        const files = new Map<string, string>();
        let offset: number | null = 0;
        while (offset !== null) {
            const page = await utils.client.artifact.list.query({
                limit: artifactListPageMax,
                offset,
                order: 'path',
                prefix: folder,
                recursive: true,
                serverId,
            });
            for (const artifact of page.artifacts) {
                files.set(artifactPathKey(artifact.path), artifact.sha256);
            }
            offset = page.next_offset;
        }
        return files;
    }

    async function start(sources: readonly UploadSource<File>[], folder: string) {
        if (sources.length === 0) {
            return;
        }
        if (busy) {
            // Upload stays pressable during an upload; a second batch waits its turn.
            toast('One upload at a time', {
                description: 'Let this upload finish, or cancel it, then upload again.',
            });
            return;
        }
        setState({ phase: 'planning' });
        try {
            const existing = await existingFiles(folder);
            const planned = planArtifactUpload(sources, folder, [...existing.keys()]);
            const plan = skipUnchangedReplacements(
                planned,
                await uploadDigests(planned.replacements),
                existing
            );
            if (plan.replacements.length > 0) {
                setState({ phase: 'confirm', plan });
                return;
            }
            await run(
                plan.additions.map((upload) => ({ ...upload, replace: false })),
                plan.rejected,
                plan.unchanged.length
            );
        } catch (error) {
            setState({ phase: 'idle' });
            toast.danger('Could not upload', {
                description: error instanceof Error ? error.message : undefined,
            });
        }
    }

    async function run(uploads: QueuedUpload[], rejected: RejectedUpload[], unchanged: number) {
        const progress: ArtifactUploadProgress = {
            doneFiles: 0,
            failures: [...rejected],
            sentBytes: 0,
            totalBytes: uploads.reduce((total, upload) => total + upload.file.size, 0),
            totalFiles: uploads.length,
            unchangedFiles: unchanged,
            uploadedFiles: 0,
        };
        if (uploads.length === 0) {
            finish(progress, false);
            return;
        }
        const abort = new AbortController();
        controller.current = abort;
        const sentByFile = new Map<string, number>();
        const publish = () => setState({ phase: 'uploading', progress: { ...progress } });
        publish();
        const queue = [...uploads];
        const send = async ({ file, path, replace }: QueuedUpload) => {
            const track = (sent: number) => {
                progress.sentBytes += sent - (sentByFile.get(path) ?? 0);
                sentByFile.set(path, sent);
                publish();
            };
            try {
                const token = getAppSessionAccessToken();
                if (!token) {
                    throw new Error('Sign in to upload files.');
                }
                await publishArtifactFile({
                    file,
                    onProgress: track,
                    path,
                    replace,
                    serverId,
                    signal: abort.signal,
                    token,
                });
                track(file.size);
                progress.uploadedFiles += 1;
            } catch (error) {
                if (!(error instanceof ArtifactUploadCancelled)) {
                    track(file.size);
                    progress.failures.push({
                        message: error instanceof Error ? error.message : 'Upload failed.',
                        path,
                    });
                }
            }
            progress.doneFiles += 1;
            publish();
        };
        const worker = async () => {
            for (
                let upload = queue.shift();
                upload && !abort.signal.aborted;
                upload = queue.shift()
            ) {
                await send(upload);
            }
        };
        await Promise.all(Array.from({ length: Math.min(concurrency, uploads.length) }, worker));
        controller.current = null;
        // A Replace adds a revision, so an open file and its history refresh too.
        await Promise.all([
            utils.artifact.list.invalidate(),
            utils.artifact.creators.invalidate(),
            utils.artifact.get.invalidate(),
            utils.artifact.versions.invalidate(),
        ]);
        finish(progress, abort.signal.aborted);
    }

    function finish(progress: ArtifactUploadProgress, cancelled: boolean) {
        if (progress.failures.length > 0) {
            setState({ phase: 'done', progress: { ...progress } });
            return;
        }
        setState({ phase: 'idle' });
        const summary = uploadSummary(progress);
        if (cancelled) {
            toast('Upload cancelled', summary ? { description: summary } : undefined);
        } else if (summary) {
            toast.success(summary);
        }
    }

    /** Answers the replace question: Replace overwrites those files, Skip keeps them. */
    function confirm(replaceExisting: boolean) {
        if (state.phase !== 'confirm') {
            return;
        }
        const { additions, rejected, replacements, unchanged } = state.plan;
        // Only paths that were taken overwrite; a free path taken meanwhile still conflicts.
        const queued = [
            ...(replaceExisting
                ? replacements.map((upload) => ({ ...upload, replace: true }))
                : []),
            ...additions.map((upload) => ({ ...upload, replace: false })),
        ];
        void run(queued, rejected, unchanged.length);
    }

    return {
        /** Stops an upload in flight: files already published stay, the rest never start. */
        abort: () => controller.current?.abort(),
        cancel: () => setState({ phase: 'idle' }),
        confirm,
        dismiss: () => setState({ phase: 'idle' }),
        start,
        state,
    };
}

/** "Uploaded 3 files · 2 unchanged", or null when nothing happened worth saying. */
export function uploadSummary(progress: ArtifactUploadProgress): string | null {
    const parts = [
        progress.uploadedFiles > 0
            ? `Uploaded ${progress.uploadedFiles === 1 ? '1 file' : `${progress.uploadedFiles} files`}`
            : null,
        progress.unchangedFiles > 0
            ? `${progress.unchangedFiles === 1 ? '1 file' : `${progress.unchangedFiles} files`} already up to date`
            : null,
    ].filter((part) => part !== null);
    return parts.length > 0 ? parts.join(' · ') : null;
}
