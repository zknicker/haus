import { HausUpdateFooterContainer } from '../updates/haus-update-footer-container.tsx';
import { CapyAccountMenu } from './capy-account-menu.tsx';
import { CapyFooterSections } from './capy-footer-sections.tsx';

export function CapySidebarFooter({
    onOpenSettings,
    serverId,
    slug,
}: {
    onOpenSettings: () => void;
    serverId: string;
    slug: string;
}) {
    return (
        <div className="flex w-full flex-col gap-2">
            <HausUpdateFooterContainer slug={slug} />
            <div className="flex w-full items-center justify-between gap-1">
                <CapyAccountMenu onOpenSettings={onOpenSettings} serverId={serverId} />
                <CapyFooterSections serverId={serverId} slug={slug} />
            </div>
        </div>
    );
}
