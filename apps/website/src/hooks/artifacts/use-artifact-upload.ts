import { artifactListPageMax } from '@haus/api';
import { toast } from '@heroui/react';
import * as React from 'react';
import {
    type PlannedUpload,
    planArtifactUpload,
    type RejectedUpload,
    type UploadPlan,
    type UploadSource,
} from '../../features/artifacts/upload-plan.ts';
import { getClerkSessionToken } from '../../lib/clerk.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { publishArtifactFile } from './publish-artifact-file.ts';

export interface ArtifactUploadProgress {
    doneFiles: number;
    failures: RejectedUpload[];
    sentBytes: number;
    totalBytes: number;
    totalFiles: number;
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
 * Human uploads into one drive folder. Plans against the paths already under
 * the folder, asks once when some would be replaced, then publishes a few
 * files at a time through the member route, refreshing the library at the
 * end. Refused paths and failed files stay listed until dismissed.
 */
export function useArtifactUpload(serverId: string) {
    const utils = hausTrpc.useUtils();
    const [state, setState] = React.useState<ArtifactUploadState>({ phase: 'idle' });
    const busy = state.phase === 'planning' || state.phase === 'uploading';

    async function existingPaths(folder: string): Promise<string[]> {
        const paths: string[] = [];
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
            paths.push(...page.artifacts.map((artifact) => artifact.path));
            offset = page.next_offset;
        }
        return paths;
    }

    async function start(sources: readonly UploadSource<File>[], folder: string) {
        if (busy || sources.length === 0) {
            return;
        }
        setState({ phase: 'planning' });
        try {
            const plan = planArtifactUpload(sources, folder, await existingPaths(folder));
            if (plan.replacements.length > 0) {
                setState({ phase: 'confirm', plan });
                return;
            }
            await run(
                plan.additions.map((upload) => ({ ...upload, replace: false })),
                plan.rejected
            );
        } catch (error) {
            setState({ phase: 'idle' });
            toast.danger('Could not upload', {
                description: error instanceof Error ? error.message : undefined,
            });
        }
    }

    async function run(uploads: QueuedUpload[], rejected: RejectedUpload[]) {
        if (uploads.length === 0) {
            const empty = {
                doneFiles: 0,
                failures: rejected,
                sentBytes: 0,
                totalBytes: 0,
                totalFiles: 0,
                uploadedFiles: 0,
            };
            setState(rejected.length > 0 ? { phase: 'done', progress: empty } : { phase: 'idle' });
            return;
        }
        const progress: ArtifactUploadProgress = {
            doneFiles: 0,
            failures: [...rejected],
            sentBytes: 0,
            totalBytes: uploads.reduce((total, upload) => total + upload.file.size, 0),
            totalFiles: uploads.length,
            uploadedFiles: 0,
        };
        const sentByFile = new Map<string, number>();
        const publish = () => setState({ phase: 'uploading', progress: { ...progress } });
        publish();
        const queue = [...uploads];
        const worker = async () => {
            for (let upload = queue.shift(); upload; upload = queue.shift()) {
                const { file, path, replace } = upload;
                const track = (sent: number) => {
                    progress.sentBytes += sent - (sentByFile.get(path) ?? 0);
                    sentByFile.set(path, sent);
                    publish();
                };
                try {
                    const token = await getClerkSessionToken();
                    if (!token) {
                        throw new Error('Sign in to upload files.');
                    }
                    await publishArtifactFile({
                        file,
                        onProgress: track,
                        path,
                        replace,
                        serverId,
                        token,
                    });
                    track(file.size);
                    progress.uploadedFiles += 1;
                } catch (error) {
                    track(file.size);
                    progress.failures.push({
                        message: error instanceof Error ? error.message : 'Upload failed.',
                        path,
                    });
                }
                progress.doneFiles += 1;
                publish();
            }
        };
        await Promise.all(Array.from({ length: Math.min(concurrency, uploads.length) }, worker));
        // A Replace adds a revision, so an open file and its history refresh too.
        await Promise.all([
            utils.artifact.list.invalidate(),
            utils.artifact.creators.invalidate(),
            utils.artifact.get.invalidate(),
            utils.artifact.versions.invalidate(),
        ]);
        if (progress.failures.length === 0) {
            setState({ phase: 'idle' });
            const uploaded = progress.uploadedFiles;
            toast.success(uploaded === 1 ? 'Uploaded 1 file' : `Uploaded ${uploaded} files`);
        } else {
            setState({ phase: 'done', progress: { ...progress } });
        }
    }

    /** Answers the replace question: Replace overwrites those files, Skip keeps them. */
    function confirm(replaceExisting: boolean) {
        if (state.phase !== 'confirm') {
            return;
        }
        const { additions, rejected, replacements } = state.plan;
        // Only paths that were taken overwrite; a free path taken meanwhile still conflicts.
        const queued = [
            ...(replaceExisting
                ? replacements.map((upload) => ({ ...upload, replace: true }))
                : []),
            ...additions.map((upload) => ({ ...upload, replace: false })),
        ];
        void run(queued, rejected);
    }

    return {
        cancel: () => setState({ phase: 'idle' }),
        confirm,
        dismiss: () => setState({ phase: 'idle' }),
        start,
        state,
    };
}
