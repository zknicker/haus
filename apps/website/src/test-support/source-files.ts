import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface SourceFile {
    content: string;
    /** Path relative to `apps/website/src`, with forward slashes. */
    path: string;
}

const sourceRoot = join(import.meta.dir, '..');

/** Every non-test `.ts`/`.tsx` file under `apps/website/src`, for source contract tests. */
export function readAppSourceFiles(): SourceFile[] {
    return listSourceFiles(sourceRoot).map((path) => ({
        content: readFileSync(path, 'utf8'),
        path: relative(sourceRoot, path).split('\\').join('/'),
    }));
}

function listSourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            return entry.name === 'test-support' ? [] : listSourceFiles(path);
        }
        if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) {
            return [];
        }
        return [path];
    });
}
