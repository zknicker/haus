import { holdDesktopLock } from '../desktop-lock.ts';

const lockPath = process.argv[2];
if (!lockPath) {
    throw new Error('Pass the lock path.');
}
process.stdout.write('waiting\n');
const lock = await holdDesktopLock(lockPath, new AbortController().signal);
process.stdout.write('held\n');
await new Promise((resolve) => process.stdin.once('data', resolve));
await lock.release();
process.stdout.write('released\n');
process.stdin.destroy();
