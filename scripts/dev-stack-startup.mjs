export function isStartupComplete(snapshot) {
    const desktopReady =
        snapshot.processes.desktop.status === 'disabled' ||
        snapshot.processes.desktop.status === 'running';
    const hausReady = snapshot.processes.haus.status === 'running';
    const computerReady = snapshot.processes.computer.status === 'running';
    const postgresReady = snapshot.processes.postgres.status === 'running';
    const runnerReady =
        snapshot.processes.runner.status === 'disabled' ||
        snapshot.processes.runner.status === 'running';
    const storageReady =
        snapshot.processes.storage.status === 'disabled' ||
        snapshot.processes.storage.status === 'running';

    return (
        computerReady &&
        hausReady &&
        postgresReady &&
        runnerReady &&
        storageReady &&
        snapshot.processes.website.status === 'running' &&
        desktopReady
    );
}
