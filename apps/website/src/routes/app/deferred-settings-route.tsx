import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { serverRouteModules } from './server-route-modules.ts';

const SettingsSectionRoute = React.lazy(async () => ({
    default: (await serverRouteModules.settingsSection()).SettingsSectionRoute,
}));
const SettingsHumanRoute = React.lazy(async () => ({
    default: (await serverRouteModules.settingsSection()).SettingsHumanRoute,
}));

const SettingsConnectionRoute = React.lazy(async () => ({
    default: (await serverRouteModules.settingsSection()).SettingsConnectionRoute,
}));

export function DeferredSettingsSectionRoute() {
    const { pathname } = useLocation();
    return (
        <React.Suspense fallback={<div aria-busy="true" />} key={pathname}>
            <SettingsSectionRoute />
        </React.Suspense>
    );
}

export function DeferredSettingsHumanRoute() {
    const { pathname } = useLocation();
    return (
        <React.Suspense fallback={<div aria-busy="true" />} key={pathname}>
            <SettingsHumanRoute />
        </React.Suspense>
    );
}

export function DeferredSettingsConnectionRoute() {
    const { pathname } = useLocation();
    return (
        <React.Suspense fallback={<div aria-busy="true" />} key={pathname}>
            <SettingsConnectionRoute />
        </React.Suspense>
    );
}
