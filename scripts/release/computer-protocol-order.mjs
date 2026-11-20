import { runGit } from './release-utils.mjs';

const protocolPath = 'packages/haus-api/computer-protocol.json';

export async function assertComputerProtocolOrder({
    impact,
    selectedTargets,
    readProtocol = readComputerProtocolAt,
}) {
    if (selectedTargets.server === selectedTargets.computer) {
        return;
    }
    const shipping = selectedTargets.server ? 'Server' : 'Computer';
    const staying = selectedTargets.server ? 'Computer' : 'Server';
    const published = impact.targets[staying.toLowerCase()].baseline;
    const candidateProtocol = await readProtocol(impact.candidateRef);
    const publishedProtocol = await readProtocol(published.sourceRevision);
    if (candidateProtocol !== publishedProtocol) {
        throw new Error(
            `${shipping} speaks Computer protocol ${candidateProtocol}, but the last published ${staying} (${published.tag}) speaks ${publishedProtocol}, and the Server accepts only an exact match. Ship Server and Computer together.`
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
