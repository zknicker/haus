import { skoolSessionSchema } from '@haus/api';
import { toast } from '@heroui/react';
import { useRef, useState } from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { useOptionalDesktopTabs } from '../desktop-tabs/desktop-tabs-context.ts';
import { useTabId } from '../desktop-tabs/tab-presence.ts';

export function useSkoolConnect(serverId: string) {
    const tabs = useOptionalDesktopTabs();
    const originTabId = useTabId();
    const active = useRef<string | null>(null);
    const [connecting, setConnecting] = useState(false);
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.mcp.connectSkool.useMutation({
        onSuccess: async () => {
            await utils.mcp.list.invalidate({ serverId });
        },
    });
    const connect = async (connectionId?: string) => {
        const bridge = getDesktopBridge();
        if (!(tabs && bridge?.skoolLogin)) {
            toast.danger('Connect Skool in the latest Haus desktop app.');
            return;
        }
        if (active.current) {
            return;
        }
        const viewId = crypto.randomUUID();
        active.current = viewId;
        setConnecting(true);
        // Activity hides the initiating page and cleans up its effects while login is visible.
        const unsubscribe = tabs.store.subscribe(() => {
            if (originTabId && !tabs.tab(originTabId)) {
                active.current = null;
                void bridge.browserCommand?.({ kind: 'close', id: viewId }).catch(() => {
                    toast.danger('Could not close the Skool sign-in tab.');
                });
            }
        });
        try {
            const login = bridge.skoolLogin(viewId);
            tabs.openInFocusedPane(
                {
                    kind: 'browser',
                    viewId,
                    title: 'Sign in to Skool',
                    url: 'https://www.skool.com/login',
                },
                'newTab'
            );
            const session = skoolSessionSchema.parse(await login);
            if (active.current !== viewId) {
                return;
            }
            const connection = await mutation.mutateAsync({ serverId, connectionId, session });
            toast.success('Skool connected. Choose which Agents can use it.');
            return connection;
        } catch (error) {
            const canceled =
                error instanceof Error && error.message.includes('sign-in was canceled');
            if (active.current === viewId && !canceled) {
                toast.danger(
                    'Skool could not connect. Sign in again, or close the sign-in tab to cancel.'
                );
            }
        } finally {
            unsubscribe();
            const state = tabs.store.snapshot();
            const loginTab = Object.values(state.tabs).find((tab) => {
                const location = tab.history.entries[tab.history.index]?.location;
                return location?.kind === 'browser' && location.viewId === viewId;
            });
            if (loginTab) {
                tabs.close([loginTab.id]);
            }
            if (originTabId && tabs.tab(originTabId)) {
                tabs.select(originTabId);
            }
            active.current = null;
            setConnecting(false);
        }
    };
    return { connect, connecting };
}
