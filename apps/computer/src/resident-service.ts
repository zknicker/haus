import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir, platform, userInfo } from 'node:os';
import { join } from 'node:path';
import { computerBundleId, computerEntrypoint } from './build-identity.ts';
import { linkComputerCli, runningComputerApp } from './computer-app.ts';
import { recordPermissionHolder, residentExecutable } from './desktop/permission-holder.ts';
import {
    computerServiceLabel,
    replaceLaunchdService,
    restartLaunchdService,
    runsInsideLaunchdJob,
    startLaunchdService,
} from './launchd.ts';
import { runtimeSearchPath } from './runtime-discovery.ts';

export function handsOffToResident() {
    return (
        runningComputerApp() !== null && !runsInsideLaunchdJob(computerServiceLabel, process.env)
    );
}

export async function startResidentService(dataRoot: string) {
    startLaunchdService(await writeResidentService(dataRoot));
}

export async function installResidentService(dataRoot: string) {
    replaceLaunchdService(await writeResidentService(dataRoot));
}

export async function restartResidentService(dataRoot: string) {
    restartLaunchdService({
        ...(await writeResidentService(dataRoot)),
        insideJob: runsInsideLaunchdJob(computerServiceLabel, process.env),
    });
}

export async function stopResidentService() {
    if (platform() !== 'darwin') {
        return;
    }
    const plistPath = residentPlistPath();
    if (!(await stat(plistPath).catch(() => null))) {
        return;
    }
    const result = Bun.spawnSync(['/bin/launchctl', 'bootout', `gui/${userInfo().uid}`, plistPath]);
    if (result.exitCode !== 0 && result.exitCode !== 3) {
        throw new Error('Could not stop Haus Computer service.');
    }
}

export function launchdPlist(
    entrypoint: { args: string[]; executable: string },
    dataRoot: string,
    bundleId = ''
) {
    const escaped = [entrypoint.executable, ...entrypoint.args, 'start', dataRoot].map(escapeXml);
    const programArguments = escaped
        .slice(0, -1)
        .map((value) => `<string>${value}</string>`)
        .join('');
    const logPath = escapeXml(join(dataRoot, 'logs', 'computer.log'));
    const path = escapeXml(runtimeSearchPath());
    const associated = bundleId
        ? `<key>AssociatedBundleIdentifiers</key><array><string>${escapeXml(bundleId)}</string></array>`
        : '';
    return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${computerServiceLabel}</string><key>ProgramArguments</key><array>${programArguments}</array><key>EnvironmentVariables</key><dict><key>HAUS_COMPUTER_DATA_ROOT</key><string>${escaped.at(-1)}</string><key>HAUS_COMPUTER_RESIDENT</key><string>1</string><key>PATH</key><string>${path}</string></dict><key>StandardOutPath</key><string>${logPath}</string><key>StandardErrorPath</key><string>${logPath}</string><key>KeepAlive</key><true/><key>RunAtLoad</key><true/>${associated}</dict></plist>\n`;
}

async function writeResidentService(dataRoot: string) {
    const plistPath = residentPlistPath();
    await mkdir(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });
    await mkdir(dataRoot, { mode: 0o700, recursive: true });
    await mkdir(join(dataRoot, 'logs'), { mode: 0o700, recursive: true });
    const entrypoint = computerEntrypoint();
    const app = runningComputerApp();
    const plist = launchdPlist(entrypoint, dataRoot, app ? computerBundleId : '');
    const previous = await readFile(plistPath, 'utf8').catch(() => null);
    await recordPermissionHolder({
        dataRoot,
        next: entrypoint.executable,
        previous: previous ? residentExecutable(previous) : null,
    });
    if (app) {
        await linkComputerCli(app);
    }
    if (previous !== plist) {
        await writeFile(plistPath, plist, { mode: 0o600 });
    }
    return {
        domain: `gui/${userInfo().uid}`,
        label: computerServiceLabel,
        plistPath,
        run: (args: string[]) =>
            Bun.spawnSync(['/bin/launchctl', ...args], {
                stderr: 'ignore',
                stdout: 'ignore',
            }).exitCode,
    };
}

function residentPlistPath() {
    return join(homedir(), 'Library', 'LaunchAgents', `${computerServiceLabel}.plist`);
}

function escapeXml(value: string) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}
