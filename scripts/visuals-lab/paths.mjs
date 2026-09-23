// Where the lab sits in the repository. Runs are spawned with this as their
// working directory, and the reply renderer borrows the website's markdown
// parser from it.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * A results-directory name for `date`: millisecond precision, lexicographically
 * sortable (`run-reader.mjs` finds the newest run by sorting these strings),
 * and never parsed back into a date — just a unique, orderable label.
 */
export const stampFor = (date = new Date()) =>
    date.toISOString().replace('T', '-').replaceAll(':', '-').replace('.', '-').replace('Z', '');

/**
 * Creates `<parentDir>/<stamp>` and returns its path. Two jobs whose stamps
 * collide (started in the same millisecond) do not silently share a
 * directory: this retries `<stamp>-2`, `<stamp>-3`, ... until a name is free.
 */
export const mkUniqueResultsDir = async (parentDir, stamp) => {
    await mkdir(parentDir, { recursive: true });
    for (let attempt = 1; ; attempt += 1) {
        const name = attempt === 1 ? stamp : `${stamp}-${attempt}`;
        const dir = path.join(parentDir, name);
        try {
            await mkdir(dir);
            return dir;
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }
};
