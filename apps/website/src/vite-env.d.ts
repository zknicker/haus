/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_HAUS_APP_BUILD_ID: string;
    readonly VITE_HAUS_PRODUCT_VERSION: string;
    readonly VITE_HAUS_RELEASE_SNAPSHOT: import('@haus/api').HausReleaseSnapshot;
}
