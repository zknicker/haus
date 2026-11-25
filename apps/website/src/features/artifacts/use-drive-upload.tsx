import * as React from 'react';
import { useArtifactUpload } from '../../hooks/artifacts/use-artifact-upload.ts';
import { ArtifactUploadConfirm, ArtifactUploadStatus } from './artifact-upload-feedback.tsx';
import type { UploadSource } from './upload-plan.ts';
import { useUploadPickers } from './use-upload-pickers.tsx';

export type DriveUpload = ReturnType<typeof useDriveUpload>;

export function useDriveUpload(serverId: string, onStart?: (folder: string) => void) {
    const upload = useArtifactUpload(serverId);
    const target = React.useRef('');
    const start = (sources: UploadSource<File>[], folder: string) => {
        onStart?.(folder);
        void upload.start(sources, folder);
    };
    const pickers = useUploadPickers((sources) => start(sources, target.current));
    const pick = (open: () => void) => (folder: string) => {
        target.current = folder;
        open();
    };
    return {
        dialogs: (
            <>
                {pickers.inputs}
                <ArtifactUploadConfirm
                    onCancel={upload.cancel}
                    onConfirm={upload.confirm}
                    plan={upload.state.phase === 'confirm' ? upload.state.plan : null}
                />
            </>
        ),
        isPending: upload.state.phase === 'planning',
        openFiles: pick(pickers.openFiles),
        openFolder: pick(pickers.openFolder),
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
