export function drivePagePath(fencePath: string, agentHandle: null | string | undefined) {
    const [root, ...rest] = fencePath.split('/');
    if (rest.length === 0) {
        return null;
    }
    if (root === 'drive') {
        return rest.join('/');
    }
    if (root !== 'workbench') {
        return null;
    }
    if (agentHandle === undefined) {
        return undefined;
    }
    return agentHandle ? `agents/${agentHandle}/${fencePath}` : null;
}

export function namesLegacyWorkbench(fencePath: string) {
    return fencePath.startsWith('workbench/');
}
