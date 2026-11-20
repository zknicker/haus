import { runGit } from './release-utils.mjs';

const protocolPath = 'packages/haus-api/computer-protocol.json';

export async function assertComputerProtocolOrder({
    impact,
    selectedTargets,
    readProtocol = readComputerProtocolAt,
}) {
    if (!selectedTargets.server || selectedTargets.computer) {
        return;
    }
    const published = impact.targets.computer.baseline;
    const candidateProtocol = await readProtocol(impact.candidateRef);
    const publishedProtocol = await readProtocol(published.sourceRevision);
    if (candidateProtocol > publishedProtocol) {
        throw new Error(
            `Server requires Computer protocol ${candidateProtocol}, but the last published Computer (${published.tag}) speaks ${publishedProtocol}. Publish Computer in this release or an earlier one.`
        );
    }
}

export async function readComputerProtocolAt(revision) {
    const { stdout } = await runGit(['show', `${revision}:${protocolPath}`]);
    const { version } = JSON.parse(stdout);
    if (!Number.isSafeInteger(version) || version < 1) {
        throw new Error(`${protocolPath} at ${revision} has no positive integer version`);
    }
    return version;
}
