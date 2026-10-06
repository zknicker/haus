import { useNavigate } from 'react-router-dom';
import { useReloadWebsite } from '../../hooks/updates/use-reload-website.ts';
import { serverComputersRoute } from '../servers/server-routes.ts';
import { performHausUpdateAction } from './haus-update-action.ts';
import { HausUpdateFooter } from './haus-update-footer.tsx';
import { HausUpdateRestartDialog } from './haus-update-restart-dialog.tsx';
import { useHausUpdate } from './use-haus-update.ts';

export function HausUpdateFooterContainer({ slug }: { slug: string }) {
    const update = useHausUpdate();
    const navigate = useNavigate();
    const reload = useReloadWebsite();
    if (!update.isSettled) {
        return null;
    }
    return (
        <>
            <HausUpdateFooter
                isRunning={update.isRunning}
                offlineComputers={update.offlineComputers}
                onAction={(action) =>
                    performHausUpdateAction(action, {
                        reload,
                        restartApp: () => void update.restartApp(),
                        run: () => void update.run(),
                    })
                }
                onOpenComputer={(computerId) => {
                    navigate(
                        `${serverComputersRoute(slug)}?computer=${encodeURIComponent(computerId)}`
                    );
                }}
                sequence={update.sequence}
                view={update.view}
            />
            <HausUpdateRestartDialog
                isOpen={update.isRestartOffered}
                onLater={update.dismissRestartOffer}
                onRestart={() => void update.restartApp()}
            />
        </>
    );
}
