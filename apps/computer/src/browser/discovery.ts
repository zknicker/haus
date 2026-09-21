import path from 'node:path';
import type { AgentRuntimeBrowserSettings } from '@haus/api';
import { SystemCdpProber } from './cdp-probe.ts';
import { detectChromeApplications } from './chrome-detection.ts';
import { SystemProcessList } from './chrome-processes.ts';
import type { ChromeApplication, ProcessRecord } from './types.ts';

type DiscoveredBrowser = AgentRuntimeBrowserSettings['browsers'][number];

export async function discoverBrowsers(root: string) {
    const applications = await detectChromeApplications();
    const processes = applications.length ? await new SystemProcessList().read() : [];
    const candidates = existingBrowserCandidates({ applications, processes, root });
    const prober = new SystemCdpProber();
    const browsers = await Promise.all(
        candidates.map(async (browser) => ({
            ...browser,
            available: (await prober.probe(browser.userDataDir)).state === 'healthy',
        }))
    );
    return { browsers };
}

export function existingBrowserCandidates(input: {
    applications: ChromeApplication[];
    processes: ProcessRecord[];
    root: string;
}): Omit<DiscoveredBrowser, 'available'>[] {
    const browsers = new Map<string, Omit<DiscoveredBrowser, 'available'>>();
    for (const record of input.processes) {
        if (
            record.command.includes('--type=') ||
            !record.command.includes('--remote-debugging-port=0')
        ) {
            continue;
        }
        const application = input.applications.find((app) =>
            record.command.startsWith(`${app.executablePath} `)
        );
        const userDataDir = chromeUserDataDir(record.command);
        if (!(application && userDataDir) || isHausProfile(userDataDir, input.root)) {
            continue;
        }
        browsers.set(userDataDir, {
            applicationPath: application.path,
            version: application.version,
            name: path.basename(userDataDir),
            userDataDir,
        });
    }
    return [...browsers.values()];
}

export function chromeUserDataDir(command: string): string | null {
    const match = command.match(/(?:^| )--user-data-dir(?:=| )(.+?)(?= --|$)/u);
    const value = match?.[1]?.trim().replace(/^"(.*)"$/u, '$1');
    return value && path.isAbsolute(value) ? value : null;
}

function isHausProfile(userDataDir: string, root: string): boolean {
    // Never offer another Server attachment's managed profile for adoption.
    const serversRoot =
        path.basename(path.dirname(path.dirname(root))) === 'servers'
            ? path.dirname(path.dirname(root))
            : root;
    const relative = path.relative(serversRoot, userDataDir);
    return (
        relative === '' ||
        (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
    );
}
