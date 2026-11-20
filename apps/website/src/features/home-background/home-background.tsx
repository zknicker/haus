import * as React from 'react';
import { useActiveThemeBackground } from '../../hooks/shell/use-theme-background.ts';
import { homeInputOpacity } from '../../lib/home-background-style.ts';
import { HomeBackgroundLayers } from './home-background-layers.tsx';

export const HomeBackground = React.memo(function HomeBackground() {
    const background = useActiveThemeBackground();
    const inputOpacity = homeInputOpacity(background);
    const [layer, setLayer] = React.useState<HTMLDivElement | null>(null);

    React.useLayoutEffect(() => {
        const host = layer?.parentNode as HTMLElement | null | undefined;
        if (!host) {
            return;
        }
        host.style.setProperty('--home-input-opacity', inputOpacity);
        return () => {
            host.style.removeProperty('--home-input-opacity');
        };
    }, [layer, inputOpacity]);

    return (
        <HomeBackgroundLayers
            background={background}
            className="home-background--page"
            ref={setLayer}
        />
    );
});
