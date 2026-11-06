/**
 * ADR 0051 made `haus task` mean board Tasks and moved the message verbs to `haus claim`. Live
 * Agents still have `haus task claim` in old notes, so these three verbs stay unknown commands but
 * name their replacement. Remove this file and its call in `subcommand.ts` a couple of releases
 * after ADR 0051 ships.
 */
const MOVED_TASK_VERBS = new Map([
    ['claim', 'haus claim'],
    ['unassign', 'haus claim unassign'],
    ['unclaim', 'haus claim release'],
]);

export function movedTaskVerbHint(groupName: string, name: string | undefined): string | undefined {
    const replacement = groupName === 'task' && name ? MOVED_TASK_VERBS.get(name) : undefined;
    if (!replacement) {
        return;
    }
    return `Claims moved: use \`${replacement} --target <target> --number <n>\`. \`haus task\` is now board Tasks.`;
}
