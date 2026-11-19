import { toast } from '@heroui/react';

/** Success note for settings that agents pick up once per session. */
export const nextSessionNote = "Takes effect on each Captain's next session.";

export async function withSavingToast<T>(
    operation: () => Promise<T>,
    options: { successNote?: string } = {}
): Promise<T> {
    const toastId = toast('Saving…', { isLoading: true, timeout: 0 });

    try {
        const result = await operation();
        toast.close(toastId);
        if (options.successNote) {
            toast.success('Saved', { description: options.successNote });
        }
        return result;
    } catch (error) {
        toast.close(toastId);
        toast.danger('Save failed', { description: getErrorMessage(error) });
        throw error;
    }
}

/**
 * Error-only variant for optimistic saves: no loading toast (the UI already
 * reflects the change), just a failure toast when the save does not stick.
 */
export async function withSaveErrorToast<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        toast.danger('Save failed', { description: getErrorMessage(error) });
        throw error;
    }
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Try saving again.';
}
