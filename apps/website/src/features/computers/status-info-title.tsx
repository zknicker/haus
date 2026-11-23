import type React from 'react';
import { SettingsRowTitle } from '../settings/layout/settings-row-title.tsx';

export function StatusInfoTitle({
    children,
    info,
    status,
}: {
    children: string;
    info: React.ReactNode;
    status: React.ReactNode;
}) {
    return (
        <div className="flex min-w-0 items-center gap-2">
            <SettingsRowTitle info={info}>{children}</SettingsRowTitle>
            {status}
        </div>
    );
}
