import type * as React from 'react';
import { HausUpdateFooterContainer } from '../updates/haus-update-footer-container.tsx';
import { CapyAccountMenu } from './capy-account-menu.tsx';

export function CapySidebarFooter({
    children,
    onOpenSettings,
    serverId,
    slug,
}: {
    children?: React.ReactNode;
    onOpenSettings: () => void;
    serverId: string;
    slug: string;
}) {
    return (
        <div className="flex w-full flex-col gap-2">
            <HausUpdateFooterContainer slug={slug} />
            <div className="flex w-full items-center justify-between gap-1">
                <CapyAccountMenu onOpenSettings={onOpenSettings} serverId={serverId} />
                {children}
            </div>
        </div>
    );
}
