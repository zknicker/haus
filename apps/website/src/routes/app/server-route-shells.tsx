// Route frames arrive with the authenticated shell; only their content stays deferred.
export { ActivityPage } from './activity-page.tsx';
export { AgentProfileRoute } from './agent-page.tsx';
export { ChatRoute, ImplicitAgentDmRoute } from './chat-route.tsx';
export {
    DeferredSettingsConnectionRoute,
    DeferredSettingsDeviceRoute,
    DeferredSettingsHumanRoute,
    DeferredSettingsProjectRoute,
    DeferredSettingsSectionRoute,
} from './deferred-settings-route.tsx';
export { InboxPage } from './inbox-page.tsx';
export { IssuePageRoute } from './issue-page-route.tsx';
export { IssuesPageRoute } from './issues-page-route.tsx';
export { SearchRoute } from './search-route.tsx';
export { ServerDefaultPage } from './server-default-page.tsx';
export { ServerLayout } from './server-layout.tsx';
export { ServerSettingsPage } from './server-settings-page.tsx';
export { SharedArtifactsPage } from './shared-artifacts-page.tsx';
export { TaskPageRoute } from './task-page-route.tsx';
export { TasksPageRoute } from './tasks-page-route.tsx';
export { WorkerPageRoute } from './worker-page-route.tsx';
