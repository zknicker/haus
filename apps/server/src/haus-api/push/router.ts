import { createRouter } from '../trpc.ts';
import { registerDeviceProcedure } from './register-device.ts';
import { unregisterDeviceProcedure } from './unregister-device.ts';

export const pushRouter = createRouter({
    registerDevice: registerDeviceProcedure,
    unregisterDevice: unregisterDeviceProcedure,
});
