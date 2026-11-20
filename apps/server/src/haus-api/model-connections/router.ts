import { createRouter } from '../trpc.ts';
import { addModelConnectionProcedure } from './add.ts';
import { assignAgentModelConnectionProcedure } from './assign-agent.ts';
import { cancelModelSignInProcedure } from './cancel-sign-in.ts';
import { listModelConnectionsProcedure } from './list.ts';
import { makeDefaultModelConnectionProcedure } from './make-default.ts';
import { onModelConnectionsUpdatedProcedure } from './on-updated.ts';
import { removeModelConnectionProcedure } from './remove.ts';
import { renameModelConnectionProcedure } from './rename.ts';
import { setModelConnectionWebSearchProcedure } from './set-web-search.ts';
import { modelSignInProcedure } from './sign-in.ts';
import { startModelSignInProcedure } from './start-sign-in.ts';

export const modelConnectionsRouter = createRouter({
    add: addModelConnectionProcedure,
    assignAgent: assignAgentModelConnectionProcedure,
    cancelSignIn: cancelModelSignInProcedure,
    list: listModelConnectionsProcedure,
    makeDefault: makeDefaultModelConnectionProcedure,
    onUpdated: onModelConnectionsUpdatedProcedure,
    remove: removeModelConnectionProcedure,
    rename: renameModelConnectionProcedure,
    setWebSearch: setModelConnectionWebSearchProcedure,
    signIn: modelSignInProcedure,
    startSignIn: startModelSignInProcedure,
});
