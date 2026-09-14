export interface PlanWindow {
    id: string;
    resetsAt: string | null;
    usedPercent: number;
}

export interface DisplayPlanWindow extends PlanWindow {
    label: string;
}

export function selectWindow(
    windows: PlanWindow[],
    id: string,
    label: string
): DisplayPlanWindow | null {
    const window = windows.find((candidate) => candidate.id === id);
    return window ? { ...window, label } : null;
}

export function usageColor(usedPercent: number): 'accent' | 'danger' | 'warning' {
    if (usedPercent >= 90) {
        return 'danger';
    }
    return usedPercent >= 75 ? 'warning' : 'accent';
}
