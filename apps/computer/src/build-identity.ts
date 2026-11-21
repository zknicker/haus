import computerPackage from '../package.json' with { type: 'json' };

export const computerVersion = process.env.HAUS_COMPUTER_BUILD_VERSION ?? computerPackage.version;
export const computerSourceRevision =
    process.env.HAUS_COMPUTER_BUILD_SOURCE_REVISION ?? 'development';
export const computerReleasePublicKey = process.env.HAUS_COMPUTER_BUILD_RELEASE_PUBLIC_KEY ?? '';
export const computerAppleTeamId = process.env.HAUS_COMPUTER_BUILD_APPLE_TEAM_ID ?? '';
export const computerAppleSigningIdentity =
    process.env.HAUS_COMPUTER_BUILD_APPLE_SIGNING_IDENTITY ?? '';
export const computerBundleId = process.env.HAUS_COMPUTER_BUILD_BUNDLE_ID ?? '';
export const computerStandalone = isStandaloneComputer(
    process.env.HAUS_COMPUTER_BUILD_STANDALONE,
    import.meta.url
);

export function isStandaloneComputer(buildFlag: string | undefined, moduleUrl: string) {
    return buildFlag === '1' || moduleUrl.includes('/$bunfs/');
}

export function computerEntrypoint(): { args: string[]; executable: string } {
    if (computerStandalone) {
        return { args: [], executable: process.execPath };
    }
    return {
        args: [new URL('index.ts', import.meta.url).pathname],
        executable: process.execPath,
    };
}

export function computerAttachmentDaemonEntrypoint(
    serverId: string,
    options: { watch: boolean }
): { args: string[]; executable: string } {
    const entrypoint = computerEntrypoint();
    return {
        args: [
            ...(options.watch && !computerStandalone ? ['--watch'] : []),
            ...entrypoint.args,
            '__attachment-daemon',
            serverId,
        ],
        executable: entrypoint.executable,
    };
}
