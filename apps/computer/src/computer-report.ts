import { detectComputerUseReadiness } from './desktop/desktop-readiness.ts';
import {
    listAgentSkillImportReports,
    listAgentSkillReports,
    listImportableSkills,
} from './host-skills.ts';
import { detectFullInventory } from './inventory.ts';
import { refreshRuntimeAuthentication } from './runtime-auth-refresh.ts';
import { readRuntimeIssues } from './runtime-issues.ts';
import { loginKeychain } from './secrets/keychain.ts';
import { readSecretsStatus } from './secrets/store.ts';
import { readDefaultCloudAgentProvider } from './workers/settings.ts';

export function createComputerReporter(dataRoot: string) {
    return async (
        send: (frame: unknown) => boolean,
        serverId: string,
        computerName: string,
        recheckAuthentication = false
    ) => {
        if (recheckAuthentication) {
            await refreshRuntimeAuthentication({ dataRoot });
        }
        await sendEffectiveComputerReport({ send, serverId, computerName, dataRoot });
    };
}

const reportedComputerUse = new Map<string, string>();

export async function refreshComputerUseReport(input: {
    send(frame: unknown): boolean;
    serverId: string;
    computerName: string;
    dataRoot: string;
}) {
    const computerUse = await detectComputerUseReadiness({ dataRoot: input.dataRoot });
    const reported = reportedComputerUse.get(reportKey(input));
    if (reported === undefined || reported === JSON.stringify(computerUse ?? null)) {
        return;
    }
    await sendEffectiveComputerReport(input);
}

export async function sendEffectiveComputerReport({
    send,
    serverId,
    computerName,
    dataRoot,
}: {
    send(frame: unknown): boolean;
    serverId: string;
    computerName: string;
    dataRoot: string;
}) {
    const inventory = await detectFullInventory({
        dataRoot,
        defaultCloudAgentProvider: await readDefaultCloudAgentProvider(dataRoot),
    });
    send({
        agents: [],
        inventory: {
            ...inventory,
            runtimeIssues: await readRuntimeIssues(dataRoot),
            agentSkillImports: await listAgentSkillImportReports(dataRoot, serverId),
            agentSkills: await listAgentSkillReports(dataRoot, serverId),
            importableSkills: await listImportableSkills(),
            name: computerName,
            // An unreadable secrets state must not cost the whole report.
            secrets: await readSecretsStatus({
                dataRoot,
                keychain: loginKeychain(),
                serverId,
            }).catch(reportStateError),
        },
        type: 'report',
    });
    reportedComputerUse.set(
        reportKey({ dataRoot, serverId }),
        JSON.stringify(inventory.computerUse ?? null)
    );
}

function reportKey(input: { dataRoot: string; serverId: string }) {
    return `${input.dataRoot}:${input.serverId}`;
}

export function reportStateError(error: unknown) {
    console.error(
        `Computer state report failed: ${error instanceof Error ? error.message : error}`
    );
}
