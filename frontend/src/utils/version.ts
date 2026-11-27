export interface SystemVersionPayload {
  name: string;
  version: string;
  apiVersion: string;
  commit: string;
  releasedAt: string | null;
  startedAt: string;
  uptimeSeconds: number;
  environment: string;
}

export const CLIENT_VERSION_INFO = {
  version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.1.0',
  commit: typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'dev',
  apiVersion: typeof __APP_API_VERSION__ !== 'undefined' ? __APP_API_VERSION__ : 'v1',
  buildTime: typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '',
  get displayVersion(): string {
    return `v${this.version}`;
  },
};

type VersionMismatchListener = (serverVersion: string) => void;

const listeners = new Set<VersionMismatchListener>();
let latestDetectedMismatch: string | null = null;

export function reportServerVersion(serverVersion: string | null | undefined): void {
  const clean = serverVersion?.trim();
  if (!clean || clean === CLIENT_VERSION_INFO.version) {
    return;
  }
  if (latestDetectedMismatch === clean) {
    return;
  }
  latestDetectedMismatch = clean;
  listeners.forEach((cb) => cb(clean));
}

export function subscribeServerVersionMismatch(cb: VersionMismatchListener): () => void {
  listeners.add(cb);
  if (latestDetectedMismatch && latestDetectedMismatch !== CLIENT_VERSION_INFO.version) {
    cb(latestDetectedMismatch);
  }
  return () => {
    listeners.delete(cb);
  };
}
