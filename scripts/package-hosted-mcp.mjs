import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../apps/hosted-mcp/', import.meta.url));

/** Ship a relocatable interpreter and frozen dependencies; hosts install nothing at boot. */
export async function packageHostedMcp(destination) {
    execFileSync('uv', ['sync', '--frozen', '--python', '3.12.12', '--managed-python'], {
        cwd: source,
        stdio: 'inherit',
    });
    const paths = JSON.parse(
        execFileSync(
            'uv',
            [
                'run',
                '--frozen',
                'python',
                '-c',
                'import json,sys,sysconfig; print(json.dumps({"runtime":sys.base_prefix,"packages":sysconfig.get_path("purelib")}))',
            ],
            { cwd: source, encoding: 'utf8' }
        )
    );
    await fs.mkdir(destination, { recursive: true });
    for (const directory of ['python', 'hosted']) {
        await fs.rm(path.join(destination, directory), { recursive: true, force: true });
    }
    await fs.cp(paths.runtime, path.join(destination, 'python'), {
        recursive: true,
        dereference: true,
    });
    await fs.cp(paths.packages, path.join(destination, 'python/lib/python3.12/site-packages'), {
        recursive: true,
        dereference: true,
    });
    await fs.cp(path.join(source, 'hosted'), path.join(destination, 'hosted'), {
        recursive: true,
        filter: (file) => !file.includes('__pycache__'),
    });
    await fs.copyFile(path.join(source, 'uv.lock'), path.join(destination, 'uv.lock'));
    const python = path.join(destination, 'python/bin/python3.12');
    execFileSync(python, ['-c', 'import ssl,catknows,mcp,uvicorn,hosted.managed'], {
        cwd: destination,
        env: {
            PATH: '/usr/bin:/bin',
            PYTHONHOME: path.join(destination, 'python'),
            PYTHONPATH: destination,
            PYTHONDONTWRITEBYTECODE: '1',
        },
        stdio: 'inherit',
    });
    execFileSync(
        'bun',
        [fileURLToPath(new URL('./verify-hosted-mcp.ts', import.meta.url)), destination],
        { stdio: 'inherit', env: { PATH: process.env.PATH } }
    );
}

if (import.meta.main || process.argv[1] === fileURLToPath(import.meta.url)) {
    const destination = process.argv[2];
    if (!destination) {
        throw new Error('Usage: package-hosted-mcp OUTPUT_DIRECTORY');
    }
    await packageHostedMcp(path.resolve(destination));
}
