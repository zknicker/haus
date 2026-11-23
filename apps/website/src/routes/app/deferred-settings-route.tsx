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

const SettingsProjectRoute = React.lazy(async () => ({
    default: (await serverRouteModules.settingsSection()).SettingsProjectRoute,
}));

export function DeferredSettingsProjectRoute() {
    const { pathname } = useLocation();
    return (
        <React.Suspense fallback={<div aria-busy="true" />} key={pathname}>
            <SettingsProjectRoute />
        </React.Suspense>
    );
}

const SettingsDeviceRoute = React.lazy(async () => ({
    default: (await serverRouteModules.settingsSection()).SettingsDeviceRoute,
}));

export function DeferredSettingsDeviceRoute() {
    const { pathname } = useLocation();
    return (
        <React.Suspense fallback={<div aria-busy="true" />} key={pathname}>
            <SettingsDeviceRoute />
        </React.Suspense>
    );
}
