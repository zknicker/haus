import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { consoleRefusal } from './console-session.ts';

const run = promisify(execFile);
const readTimeoutMs = 10_000;
const ioregBufferBytes = 16 * 1024 * 1024;

const displaySleepScript = [
    "ObjC.import('CoreGraphics');",
    'const display = $.CGMainDisplayID();',
    "display === 0 ? 'none' : String($.CGDisplayIsAsleep(display));",
].join(' ');

export async function prepareScreen(signal: AbortSignal) {
    const ioreg = await run('/usr/sbin/ioreg', ['-n', 'Root', '-d1', '-a'], {
        maxBuffer: ioregBufferBytes,
        signal,
        timeout: readTimeoutMs,
    });
    const refusal = consoleRefusal(ioreg.stdout, currentUid());
    if (refusal) {
        return refusal;
    }
    const display = await run(
        '/usr/bin/osascript',
        ['-l', 'JavaScript', '-e', displaySleepScript],
        {
            signal,
            timeout: readTimeoutMs,
        }
    );
    if (displayAsleep(display.stdout)) {
        await run('/usr/bin/caffeinate', ['-u', '-t', '2'], { signal });
    }
    return null;
}

export function displayAsleep(output: string) {
    return output.trim() === '1';
}

function currentUid() {
    if (!process.getuid) {
        throw new Error('Computer use runs on macOS Devices.');
    }
    return process.getuid();
}
