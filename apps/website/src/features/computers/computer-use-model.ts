import type { ComputerUseReadiness } from '@haus/api';

export const computerUseDescription =
    'Captains can see the screen and click and type in applications on this Device.';

export function supportsComputerUse(computer: { operatingSystem: string | null }) {
    return computer.operatingSystem?.toLowerCase() === 'darwin';
}

export type ComputerUseReadinessIssue =
    | { kind: 'install' }
    | { kind: 'denied'; pane: ComputerUsePermissionPane }
    | { kind: 'unknown'; pane: ComputerUsePermissionPane };

export type ComputerUsePermissionPane = 'Accessibility' | 'Screen Recording';

export function computerUseReadinessIssues(readiness: ComputerUseReadiness | undefined) {
    const issues: ComputerUseReadinessIssue[] = [];
    if (!readiness) {
        return issues;
    }
    if (!readiness.installed) {
        issues.push({ kind: 'install' });
        return issues;
    }
    const permissions = [
        ['Accessibility', readiness.accessibility],
        ['Screen Recording', readiness.screenRecording],
    ] as const;
    for (const [pane, state] of permissions) {
        if (state !== 'granted') {
            issues.push({ kind: state, pane });
        }
    }
    return issues;
}

export function computerUseReadinessText(issue: ComputerUseReadinessIssue) {
    switch (issue.kind) {
        case 'install':
            return 'Haus Computer couldn’t set up computer use on this Device. Update it, then Refresh.';
        case 'denied':
            return `Allow Haus Computer in System Settings → Privacy & Security → ${issue.pane}.`;
        case 'unknown':
            return `Haus couldn’t read the ${issue.pane} permission; Refresh to check again.`;
    }
}
