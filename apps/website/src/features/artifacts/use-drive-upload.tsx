import { useArtifactUpload } from '../../hooks/artifacts/use-artifact-upload.ts';
import { ArtifactUploadConfirm, ArtifactUploadStatus } from './artifact-upload-feedback.tsx';
import type { UploadSource } from './upload-plan.ts';
import { useUploadPickers } from './use-upload-pickers.tsx';

export type DriveUpload = ReturnType<typeof useDriveUpload>;

export function useDriveUpload(
    serverId: string,
    folder: string | null,
    onStart?: (folder: string) => void
) {
    const upload = useArtifactUpload(serverId);
    const start = (sources: UploadSource<File>[]) => {
        if (folder === null) {
            return;
        }
        onStart?.(folder);
        void upload.start(sources, folder);
    };
    const pickers = useUploadPickers(start);
    return {
        dialogs: (
            <>
                {folder === null ? null : pickers.inputs}
                <ArtifactUploadConfirm
                    onCancel={upload.cancel}
                    onConfirm={upload.confirm}
                    plan={upload.state.phase === 'confirm' ? upload.state.plan : null}
                />
            </>
        ),
        isPending: upload.state.phase === 'planning',
        openFiles: pickers.openFiles,
        openFolder: pickers.openFolder,
        start,
        status: (
            <ArtifactUploadStatus
                onCancel={upload.abort}
                onDismiss={upload.dismiss}
                state={upload.state}
            />
        ),
    };
}
