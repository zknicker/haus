import * as React from 'react';
import { useDebouncedSave } from './use-debounced-save.ts';
import { useSaveToast } from './use-save-toast.ts';

export type AutoSaveStatus = 'error' | 'idle' | 'pending' | 'saved' | 'saving';

interface UseAutoSaveOptions<T> {
    debounceMs?: number;
    onSave: (value: T) => Promise<void> | void;
    successMessage: string;
}

function formatSaveError(error: unknown) {
    return error instanceof Error ? error.message : 'Failed to save changes.';
}

export function useAutoSave<T>({ debounceMs, onSave, successMessage }: UseAutoSaveOptions<T>) {
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
    const [status, setStatus] = React.useState<AutoSaveStatus>('idle');
    const { showErrorToast, showSuccessToast, toast } = useSaveToast();
    const requestedSaveRef = React.useRef(0);

    const runSave = React.useCallback(
        async (input: { value: T; version: number }) => {
            setErrorMessage(null);
            setStatus('saving');

            try {
                await onSave(input.value);

                if (input.version !== requestedSaveRef.current) {
                    return;
                }

                setStatus('saved');
                showSuccessToast(successMessage);
            } catch (error) {
                if (input.version !== requestedSaveRef.current) {
                    return;
                }

                const message = formatSaveError(error);

                setErrorMessage(message);
                setStatus('error');
                showErrorToast(message);
            }
        },
        [onSave, showErrorToast, showSuccessToast, successMessage]
    );

    const debouncedSave = useDebouncedSave((input: { value: T; version: number }) => {
        void runSave(input);
    }, debounceMs);

    const scheduleSave = React.useCallback(
        (value: T) => {
            requestedSaveRef.current += 1;
            setErrorMessage(null);
            setStatus((current) => (current === 'saving' ? 'saving' : 'pending'));
            debouncedSave({
                value,
                version: requestedSaveRef.current,
            });
        },
        [debouncedSave]
    );

    return {
        errorMessage,
        scheduleSave,
        status,
        toast,
    };
}
