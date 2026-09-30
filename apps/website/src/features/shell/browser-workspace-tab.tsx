import type { BrowserTab } from '../../lib/desktop-browser.ts';
import { ClosableWorkspaceTab } from './closable-workspace-tab.tsx';
import { BrowserTabMark } from './workspace-tab-mark.tsx';

export function BrowserWorkspaceTab({ tab }: { tab: BrowserTab }) {
    return (
        <ClosableWorkspaceTab
            label={tab.title}
            mark={<BrowserTabMark tab={tab} />}
            tabRef={{ kind: 'browser', id: tab.id }}
            tooltip={
                <>
                    <p>{tab.title}</p>
                    <p className="text-muted text-xs">{tab.url}</p>
                </>
            }
        />
    );
}
