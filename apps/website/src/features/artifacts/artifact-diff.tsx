import { MultiFileDiff } from '@pierre/diffs/react';
import { useResolvedThemeOptional } from '../../components/theme-provider.tsx';

const codeBlockThemes = { dark: 'github-dark', light: 'github-light' } as const;

export function ArtifactDiff({
    filename,
    from,
    fromRevisionId,
    to,
    toRevisionId,
}: {
    filename: string;
    from: string;
    fromRevisionId: string;
    to: string;
    toRevisionId: string;
}) {
    const themeType = useResolvedThemeOptional();
    return (
        <MultiFileDiff
            className="artifact-diff"
            newFile={{ cacheKey: toRevisionId, contents: to, name: filename }}
            oldFile={{ cacheKey: fromRevisionId, contents: from, name: filename }}
            options={{
                diffStyle: 'unified',
                disableFileHeader: true,
                overflow: 'wrap',
                theme: codeBlockThemes,
                themeType,
            }}
        />
    );
}
