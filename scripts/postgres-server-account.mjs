import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// PostgreSQL's server binaries (initdb, postgres, pg_ctl) refuse to run as root.
// Hosts that run agents as root, such as Claude cloud containers, run them as
// the unprivileged account PostgreSQL's distribution packages create. setpriv
// execs in place, so signals reach the postmaster directly.
const serverAccount = 'postgres';

export function postgresServerCommand(binary, args, uid = process.getuid?.()) {
    if (uid !== 0) {
        return { args, command: binary };
    }
    return {
        args: [
            `--reuid=${serverAccount}`,
            `--regid=${serverAccount}`,
            '--init-groups',
            '--',
            binary,
            ...args,
        ],
        command: 'setpriv',
    };
}

/**
 * On a root host, moves a PostgreSQL state directory under the server account's
 * home, because that account cannot traverse root's private home directory.
 */
export function postgresServerPath(directory, uid = process.getuid?.()) {
    if (uid !== 0) {
        return directory;
    }
    const relative = path.relative(os.homedir(), directory);
    return path.join(resolveServerAccount().home, 'haus', relative);
}

/** Creates `directory` and, on a root host, hands it to the server account. */
export function preparePostgresServerDirectory(directory, uid = process.getuid?.()) {
    fs.mkdirSync(directory, { recursive: true });
    if (uid !== 0) {
        return;
    }
    const { gid, uid: accountUid } = resolveServerAccount();
    fs.chownSync(directory, accountUid, gid);
}

function resolveServerAccount() {
    const result = spawnSync('getent', ['passwd', serverAccount], { encoding: 'utf8' });
    const [, , uid, gid, , home] = result.status === 0 ? result.stdout.trim().split(':') : [];
    if (!home) {
        throw new Error(
            `PostgreSQL cannot run as root and the "${serverAccount}" account does not exist. Run as an unprivileged user or install PostgreSQL from distribution packages.`
        );
    }
    return { gid: Number(gid), home, uid: Number(uid) };
}
