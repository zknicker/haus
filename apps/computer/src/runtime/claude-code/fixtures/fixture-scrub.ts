import { realpathSync } from 'node:fs';

/**
 * Scrubs one recorded fixture line before it is committed: capture paths become stable
 * placeholders, and anything credential- or account-shaped is masked.
 */
export function scrubFixtureLine(
    line: string,
    paths: { homeDir: string; root: string; workspaceDir: string }
): string {
    let scrubbed = line;
    for (const [path, placeholder] of [
        [paths.workspaceDir, '/haus-agent/workspace'],
        [paths.homeDir, '/haus-agent/home'],
        [paths.root, '/haus-agent'],
    ] as const) {
        // The real path first: it contains the symlinked one (`/private/var` holds `/var`).
        for (const variant of new Set([real(path), path])) {
            scrubbed = scrubbed.split(variant).join(placeholder);
            // Claude Code names its project directory after the cwd with `/` and `.` as `-`.
            scrubbed = scrubbed
                .split(variant.replace(/[/.]/gu, '-'))
                .join(placeholder.replace(/\//gu, '-'));
        }
    }
    const user = process.env.USER;
    if (user) {
        scrubbed = scrubbed.replace(new RegExp(`/Users/${user}\\b`, 'gu'), '/Users/operator');
    }
    return scrubbed
        .replace(/sk-ant-[A-Za-z0-9_-]+/gu, 'sk-ant-REDACTED')
        .replace(/Bearer [A-Za-z0-9_-]{20,}/gu, 'Bearer REDACTED')
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu, 'operator@example.com');
}

function real(path: string): string {
    try {
        return realpathSync(path);
    } catch {
        return path;
    }
}
