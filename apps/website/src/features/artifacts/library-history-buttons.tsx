import { Toolbar } from '@heroui/react';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { PageToolbarButton } from '../shell/page-toolbar.tsx';
import { useLibraryHistory } from './use-library-history.ts';

/** Finder's Back and Forward chevrons for the Files view, leading its band. */
export function LibraryHistoryButtons({ slug }: { slug: string }) {
    const history = useLibraryHistory(slug);
    const mac = isMac();
    return (
        <Toolbar aria-label="Folder history" className="shrink-0">
            <PageToolbarButton
                icon={<Icon icon={ArrowLeft01Icon} size={16} />}
                isDisabled={!history.canGoBack}
                label="Back"
                onPress={history.back}
                shortcut={mac ? '⌘[' : undefined}
            />
            <PageToolbarButton
                icon={<Icon icon={ArrowRight01Icon} size={16} />}
                isDisabled={!history.canGoForward}
                label="Forward"
                onPress={history.forward}
                shortcut={mac ? '⌘]' : undefined}
            />
        </Toolbar>
    );
}

function isMac() {
    return typeof navigator !== 'undefined' && /Mac/u.test(navigator.platform);
}
