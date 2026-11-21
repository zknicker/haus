import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runningComputerApp } from '../computer-app.ts';

export function permissionHolder(executable: string) {
    return runningComputerApp(executable) ?? executable;
}

export function residentExecutable(plist: string) {
    const program = /<key>ProgramArguments<\/key><array><string>([^<]*)<\/string>/u.exec(plist);
    return program?.[1] ? unescapeXml(program[1]) : null;
}

export async function recordPermissionHolder(input: {
    dataRoot: string;
    next: string;
    previous: string | null;
}) {
    const from = input.previous ? permissionHolder(input.previous) : null;
    const to = permissionHolder(input.next);
    if (from === null || from === to) {
        return;
    }
    await mkdir(input.dataRoot, { mode: 0o700, recursive: true });
    await writeFile(
        markerPath(input.dataRoot),
        `${JSON.stringify({ from, movedAt: new Date().toISOString(), to })}\n`,
        { mode: 0o600 }
    );
}

export async function permissionsMoved(dataRoot: string) {
    return (await readFile(markerPath(dataRoot)).catch(() => null)) !== null;
}

export async function clearPermissionsMoved(dataRoot: string) {
    await rm(markerPath(dataRoot), { force: true });
}

function markerPath(dataRoot: string) {
    return join(dataRoot, 'computer-use-permissions-moved.json');
}

function unescapeXml(value: string) {
    return value
        .replaceAll('&quot;', '"')
        .replaceAll('&gt;', '>')
        .replaceAll('&lt;', '<')
        .replaceAll('&amp;', '&');
}
