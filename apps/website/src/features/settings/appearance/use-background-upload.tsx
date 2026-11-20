import * as React from 'react';
import {
    getThemeBackground,
    pruneUnusedBackgroundImages,
    saveThemeBackground,
} from '../../../hooks/shell/use-theme-background.ts';
import { putBackgroundImage } from '../../../lib/background-images.ts';
import type { ColorTheme } from '../../../lib/color-theme.ts';
import {
    backgroundImageProblem,
    backgroundImageTypes,
    imageTypeOf,
    newBackgroundImageId,
} from '../../../lib/home-background.ts';

export function useBackgroundUpload(theme: ColorTheme) {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const session = React.useRef(0);
    const [error, setError] = React.useState<{ message: string; theme: ColorTheme } | null>(null);
    if (error && error.theme !== theme) {
        setError(null);
    }

    React.useEffect(
        () => () => {
            session.current += 1;
        },
        [theme]
    );

    const accept = async (file: File) => {
        const type = imageTypeOf(file.type);
        const problem = backgroundImageProblem(file);
        if (problem || !type) {
            setError(problem ? { message: problem, theme } : null);
            return;
        }
        const started = session.current;
        const id = newBackgroundImageId();
        const saved = await putBackgroundImage(id, file).then(
            () => true,
            () => false
        );
        if (session.current !== started) {
            if (saved) {
                void pruneUnusedBackgroundImages();
            }
            return;
        }
        if (!saved) {
            setError({ message: 'This device could not save that image. Try another.', theme });
            return;
        }
        setError(null);
        saveThemeBackground(theme, {
            ...getThemeBackground(theme),
            image: { id, name: file.name.slice(0, 200), type },
            source: 'image',
        });
        void pruneUnusedBackgroundImages();
    };

    const input = (
        <input
            accept={backgroundImageTypes.join(',')}
            className="hidden"
            onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) {
                    void accept(file);
                }
            }}
            ref={inputRef}
            type="file"
        />
    );

    return {
        choose: () => inputRef.current?.click(),
        error: error?.theme === theme ? error.message : null,
        input,
    };
}

export function removeBackgroundImage(theme: ColorTheme) {
    const background = getThemeBackground(theme);
    saveThemeBackground(theme, {
        ...background,
        image: null,
        source: background.source === 'image' ? 'none' : background.source,
    });
    void pruneUnusedBackgroundImages();
}
