import { DashboardSquare01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type { AppCommandGroup } from './types.ts';

export function buildCapyShellCommandGroup({
    capyShell,
    setCapyShell,
}: {
    capyShell: boolean;
    setCapyShell: (enabled: boolean) => void;
}) {
    return {
        commands: [
            {
                icon: DashboardSquare01Icon,
                id: 'capy-shell.toggle',
                keywords: ['capy', 'shell', 'home', 'preview', 'sidebar', 'captains'],
                run: () => setCapyShell(!capyShell),
                subtitle: capyShell ? 'On' : 'Off',
                title: 'Toggle Capy shell',
            },
        ],
        id: 'capy-shell',
        title: 'Preview',
    } satisfies AppCommandGroup;
}
