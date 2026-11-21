import type { ComputerUseAccess, ComputerUseReadiness } from '@haus/api';

export const computerUseAccessOptions = [
    {
        description:
            'Every chat asks you once before a Captain clicks or types in applications on this Device; Always allow in that prompt switches this. Looking at the screen never asks',
        id: 'ask',
        label: 'Ask each chat',
    },
    {
        description: 'Every chat may click and type in applications on this Device without asking',
        id: 'always',
        label: 'Always allow',
    },
] as const satisfies ReadonlyArray<{ description: string; id: ComputerUseAccess; label: string }>;

export function computerUseAccessOption(access: ComputerUseAccess) {
    return access === 'always' ? computerUseAccessOptions[1] : computerUseAccessOptions[0];
}

export function isComputerUseAccess(value: unknown): value is ComputerUseAccess {
    return value === 'ask' || value === 'always';
}

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
