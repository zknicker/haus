import { Alert, AlertDialog, Button, CloseButton, Label, ProgressBar } from '@heroui/react';
import type { ArtifactUploadState } from '../../hooks/artifacts/use-artifact-upload.ts';
import { formatArtifactBytes } from './artifact-format.ts';
import type { UploadPlan } from './upload-plan.ts';

/**
 * The one question an upload can ask: some picked files already exist. Replace
 * overwrites them, Skip keeps them and uploads only the new ones, and closing
 * the dialog uploads nothing.
 */
export function ArtifactUploadConfirm({
    onCancel,
    onConfirm,
    plan,
}: {
    onCancel: () => void;
    onConfirm: (replace: boolean) => void;
    plan: UploadPlan<File> | null;
}) {
    const replacing = plan?.replacements.length ?? 0;
    const adding = plan?.additions.length ?? 0;
    return (
        <AlertDialog.Backdrop
            isDismissable
            isOpen={plan !== null}
            onOpenChange={(open) => !open && onCancel()}
        >
            <AlertDialog.Container size="sm">
                <AlertDialog.Dialog>
                    <AlertDialog.Header>
                        <AlertDialog.Icon status="warning" />
                        <AlertDialog.Heading>
                            Replace {replacing === 1 ? '1 file' : `${replacing} files`}?
                        </AlertDialog.Heading>
                    </AlertDialog.Header>
                    <AlertDialog.Body>
                        <p>
                            {replacing === 1 ? 'A file' : `${replacing} files`} with the same name
                            already {replacing === 1 ? 'exists' : 'exist'} here. Replacing adds a
                            new revision; earlier ones stay in history.{' '}
                            {adding === 0
                                ? 'No new files will be added.'
                                : `${adding === 1 ? '1 new file' : `${adding} new files`} will be added either way.`}
                        </p>
                    </AlertDialog.Body>
                    <AlertDialog.Footer>
                        <Button onPress={() => onConfirm(false)} variant="secondary">
                            Skip
                        </Button>
                        <Button onPress={() => onConfirm(true)}>Replace</Button>
                    </AlertDialog.Footer>
                </AlertDialog.Dialog>
            </AlertDialog.Container>
        </AlertDialog.Backdrop>
    );
}

/**
 * Upload progress at the top of the library: files and bytes while it runs,
 * then every refused or failed file until dismissed. A clean upload ends in a
 * toast instead and leaves nothing here.
 */
export function ArtifactUploadStatus({
    onDismiss,
    state,
}: {
    onDismiss: () => void;
    state: ArtifactUploadState;
}) {
    if (state.phase === 'uploading') {
        const { doneFiles, sentBytes, totalBytes, totalFiles } = state.progress;
        return (
            // Inset like the group labels, so the bar's text shares the files' left edge.
            <div className="artifact-upload-status">
                <ProgressBar
                    aria-label="Upload progress"
                    maxValue={Math.max(totalBytes, 1)}
                    size="sm"
                    value={Math.min(sentBytes, totalBytes)}
                    valueLabel={`${formatArtifactBytes(sentBytes)} of ${formatArtifactBytes(totalBytes)}`}
                >
                    <Label>
                        Uploading {Math.min(doneFiles + 1, totalFiles)} of {totalFiles}
                    </Label>
                    <ProgressBar.Output />
                    <ProgressBar.Track>
                        <ProgressBar.Fill />
                    </ProgressBar.Track>
                </ProgressBar>
            </div>
        );
    }
    if (state.phase !== 'done') {
        return null;
    }
    const { failures, uploadedFiles } = state.progress;
    return (
        <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>
                    {failures.length === 1 ? '1 file' : `${failures.length} files`} not uploaded
                    {uploadedFiles > 0 ? ` · ${uploadedFiles} uploaded` : ''}
                </Alert.Title>
                <Alert.Description>
                    <ul aria-label="Upload problems" className="flex flex-col gap-1">
                        {failures.map((failure) => (
                            <li key={`${failure.path}:${failure.message}`}>
                                <span className="font-medium">{failure.path}</span>:{' '}
                                {failure.message}
                            </li>
                        ))}
                    </ul>
                </Alert.Description>
            </Alert.Content>
            <CloseButton aria-label="Dismiss upload problems" onPress={onDismiss} />
        </Alert>
    );
}
