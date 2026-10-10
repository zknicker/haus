'use strict';

const { appWindowOf } = require('./trusted-renderer.cjs');
const { createBrowserWorkspace } = require('./browser-workspace.cjs');

/** `page` is the page-facing service set `createBrowserWorkspace` documents. */
function registerBrowserWorkspace({
    appUrl,
    BrowserWindow,
    WebContentsView,
    ipcMain,
    page,
    session,
}) {
    const workspaces = new WeakMap();
    const browserSession = session.fromPartition('persist:haus-browser');
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false)
    );
    browserSession.setPermissionCheckHandler(() => false);
    browserSession.on('will-download', (event) => event.preventDefault());
    const attach = (window) => {
        const workspace = createBrowserWorkspace(window, {
            WebContentsView,
            browserSession,
            page,
            skoolSession: (id) => {
                const isolated = session.fromPartition(`haus-skool-login-${id}`);
                isolated.setPermissionRequestHandler((_contents, _permission, callback) =>
                    callback(false)
                );
                isolated.setPermissionCheckHandler(() => false);
                isolated.on('will-download', (event) => event.preventDefault());
                return isolated;
            },
        });
        workspaces.set(window, workspace);
        return workspace;
    };
    const forSender = (event) => {
        const window = appWindowOf(event, {
            appUrl,
            BrowserWindow,
            message: 'Only the Haus App can control browser tabs.',
        });
        const workspace = workspaces.get(window);
        if (!workspace) {
            throw new Error('Browser workspace is unavailable.');
        }
        return workspace;
    };
    ipcMain.handle('desktop:browser:command', (event, command) =>
        forSender(event).command(command)
    );
    ipcMain.handle('desktop:browser:snapshot', (event) => forSender(event).snapshot());
    ipcMain.handle('desktop:browser:capture', (event, id) => forSender(event).capture(id));
    ipcMain.handle('desktop:skool:login', (event, id) => forSender(event).skoolLogin(id));
    ipcMain.handle('desktop:browser:layout', (event, placements) =>
        forSender(event).setLayout(placements)
    );
    /**
     * Moves the named live views from one window to another; ids not in `from`
     * are skipped. `shown` ({ viewId, bounds }) shows that one view in `to` at
     * once, before `to`'s App places it (a tear-off).
     */
    const transfer = (from, to, viewIds, shown) => {
        const source = workspaces.get(from);
        const target = workspaces.get(to);
        if (!(source && target) || source === target || !canTransfer(from, to, viewIds)) {
            return;
        }
        for (const id of viewIds) {
            const entry = source.release(id);
            if (entry) {
                target.adopt(id, entry, shown?.viewId === id ? shown.bounds : undefined);
            }
        }
    };
    /** Whether `to` has room under its view limit for the views of `viewIds` that `from` holds. */
    const canTransfer = (from, to, viewIds) => {
        const source = workspaces.get(from);
        const target = workspaces.get(to);
        if (!(source && target)) {
            return true;
        }
        const moving = viewIds.filter((id) => source.has(id));
        return source === target || target.hasRoomFor(moving);
    };
    return {
        attach,
        canTransfer,
        forWindow: (window) => workspaces.get(window) ?? null,
        transfer,
    };
}

module.exports = { registerBrowserWorkspace };
