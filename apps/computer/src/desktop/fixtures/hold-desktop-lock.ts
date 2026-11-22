import { openLockedDesktop } from '../desktop-lock.ts';

const [mode, lockPath] = process.argv.slice(2);
if (!(lockPath && (mode === 'hold' || mode === 'run'))) {
    throw new Error('Pass hold or run, then the lock path.');
}
process.stdout.write('waiting\n');
const signal = new AbortController().signal;
if (mode === 'hold') {
    const desktop = await openLockedDesktop(
        lockPath,
        { args: [], env: {}, executable: '/usr/bin/true' },
        signal
    );
    process.stdout.write('held\n');
    await new Promise((resolve) => process.stdin.once('data', resolve));
    await desktop.abandon();
    process.stdout.write('released\n');
    process.stdin.destroy();
} else {
    const desktop = await openLockedDesktop(
        lockPath,
        { args: ['-c', 'echo "command $$"; exec /bin/sleep 30'], env: {}, executable: '/bin/sh' },
        signal
    );
    desktop.child.stdout?.pipe(process.stdout);
    desktop.child.stderr?.resume();
    desktop.start();
    await desktop.closed;
}
