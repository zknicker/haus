import * as React from 'react';
import type { UploadSource } from './upload-plan.ts';
import { inputUploadSources } from './upload-sources.ts';

/**
 * The library's two system pickers, files and a folder, as hidden inputs
 * rendered once, with openers any button or menu item can call.
 */
export function useUploadPickers(onSources: (sources: UploadSource<File>[]) => void) {
    const filesRef = React.useRef<HTMLInputElement>(null);
    const folderRef = React.useRef<HTMLInputElement>(null);
    const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const input = event.currentTarget;
        const sources = inputUploadSources(input.files ?? []);
        // Clear so picking the same files again still fires a change.
        input.value = '';
        onSources(sources);
    };

    const inputs = (
        <>
            <input
                aria-label="Upload files"
                hidden
                multiple
                onChange={onChange}
                ref={filesRef}
                type="file"
            />
            <input
                aria-label="Upload a folder"
                hidden
                onChange={onChange}
                ref={(element) => {
                    folderRef.current = element;
                    // Not in React's input props; the attribute turns the picker into a folder pick.
                    element?.setAttribute('webkitdirectory', '');
                }}
                type="file"
            />
        </>
    );

    return {
        inputs,
        openFiles: () => filesRef.current?.click(),
        openFolder: () => folderRef.current?.click(),
    };
}
