import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    type AgentRuntimeBrowserSettings,
    type AgentRuntimeSaveBrowserSettings,
    agentRuntimeBrowserConnectionSchema,
    agentRuntimeBrowserSettingsSchema,
    agentRuntimeSaveBrowserSettingsSchema,
} from '@haus/api';
import type { EffectRuntime } from '@haus/effect';
import * as z from 'zod';
import { discoverBrowsers } from './discovery.ts';
import { getBrowserService, reconcileBrowserService } from './service.ts';

const storedBrowserConfigSchema = z
    .object({
        enabled: z.boolean(),
        connection: agentRuntimeBrowserConnectionSchema.nullable(),
        updatedAt: z.iso.datetime({ offset: true }).nullable(),
    })
    .strict();
type BrowserConfig = z.infer<typeof storedBrowserConfigSchema>;

// Preserve the on-disk contract, but never resume ownership of a managed profile.
const oldBrowserConfigSchema = z
    .object({
        enabled: z.boolean(),
        profileName: z.string().optional(),
        connection: z
            .discriminatedUnion('kind', [
                z
                    .object({
                        kind: z.literal('managed'),
                        applicationPath: z.string().nullable(),
                        profileName: z.string(),
                    })
                    .strict(),
                agentRuntimeBrowserConnectionSchema
                    .extend({ kind: z.literal('existing') })
                    .strict(),
            ])
            .optional(),
        updatedAt: z.iso.datetime({ offset: true }).nullable(),
    })
    .strict()
    .refine((value) => value.profileName !== undefined || value.connection !== undefined)
    .transform(
        (value): BrowserConfig => ({
            enabled: value.connection?.kind === 'existing' && value.enabled,
            connection:
                value.connection?.kind === 'existing'
                    ? {
                          applicationPath: value.connection.applicationPath,
                          userDataDir: value.connection.userDataDir,
                      }
                    : null,
            updatedAt: value.updatedAt,
        })
    );

export async function getComputerBrowserSettings(
    root: string
): Promise<AgentRuntimeBrowserSettings> {
    const config = await readBrowserConfig(root);
    const service = getBrowserService();
    return agentRuntimeBrowserSettingsSchema.parse({
        ...(await discoverBrowsers(root)),
        ...config,
        configured: config.connection !== null,
        status: service?.root === root ? await service.observer.status() : null,
    });
}

export async function saveComputerBrowserSettings(
    root: string,
    input: AgentRuntimeSaveBrowserSettings,
    runtime: EffectRuntime<never>
): Promise<AgentRuntimeBrowserSettings> {
    const parsed = agentRuntimeSaveBrowserSettingsSchema.parse(input);
    await reconcileBrowserService(
        root,
        async () => {
            const current = await readBrowserConfig(root);
            const next: BrowserConfig = {
                enabled: parsed.enabled ?? current.enabled,
                connection: parsed.connection ?? current.connection,
                updatedAt: new Date().toISOString(),
            };
            if (next.enabled || parsed.connection) {
                const connection = next.connection;
                const { browsers } = await discoverBrowsers(root);
                if (
                    !(
                        connection &&
                        browsers.some(
                            (browser) =>
                                browser.available &&
                                browser.userDataDir === connection.userDataDir &&
                                browser.applicationPath === connection.applicationPath
                        )
                    )
                ) {
                    throw new Error(
                        'Select an available browser. Start it with its current owner, then refresh.'
                    );
                }
            }
            await writeBrowserConfig(root, next);
            return next;
        },
        runtime
    );
    return getComputerBrowserSettings(root);
}

export async function reconcileComputerBrowser(
    root: string,
    runtime: EffectRuntime<never>
): Promise<void> {
    await reconcileBrowserService(root, () => readBrowserConfig(root), runtime);
}

async function readBrowserConfig(root: string): Promise<BrowserConfig> {
    try {
        return z
            .union([storedBrowserConfigSchema, oldBrowserConfigSchema])
            .parse(JSON.parse(await readFile(join(root, 'settings.json'), 'utf8')));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
        return { enabled: false, connection: null, updatedAt: null };
    }
}

async function writeBrowserConfig(root: string, config: BrowserConfig): Promise<void> {
    await mkdir(root, { mode: 0o700, recursive: true });
    const destination = join(root, 'settings.json');
    const temporary = `${destination}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, destination);
}
