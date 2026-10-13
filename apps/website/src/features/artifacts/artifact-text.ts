import type { FileTextRenderer } from '../chats/file-text-preview.tsx';
import { artifactFileKind } from './icons/artifact-file-kind.ts';

interface ArtifactFile {
    content_type: string;
    filename: string;
}

/**
 * How the viewer draws a file as text, or null when it is not text: HTML as a
 * sandboxed page, Markdown rendered, and source, plain text, JSON and CSV as
 * code. Office documents, slides and other spreadsheets stay downloads.
 */
export function artifactTextRenderer(artifact: ArtifactFile): FileTextRenderer | null {
    switch (artifactFileKind(artifact)) {
        case 'html':
            return 'html';
        case 'code':
        case 'text':
            return 'code';
        case 'document':
            return matches(artifact, ['text/markdown'], ['md', 'mdx', 'markdown'])
                ? 'markdown'
                : null;
        case 'spreadsheet':
            return matches(artifact, ['text/csv', 'text/tab-separated-values'], ['csv', 'tsv'])
                ? 'code'
                : null;
        default:
            return null;
    }
}

function matches(artifact: ArtifactFile, types: string[], extensions: string[]) {
    const type = artifact.content_type.split(';')[0]?.trim().toLowerCase() ?? '';
    const extension = artifact.filename.split('.').pop()?.toLowerCase() ?? '';
    return types.includes(type) || extensions.includes(extension);
}
