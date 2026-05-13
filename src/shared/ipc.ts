// Renderer-side typed IPC client. All renderer code must go through this —
// never touch window.autosheets directly. In a non-Electron context (browser
// dev, tests) the bridge is missing, so we throw a clear error.

import type {
  IpcChannel,
  IpcRequest,
  IpcResponse,
} from './ipc-contract';

type Bridge = {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcRequest<C>) => Promise<IpcResponse<C>>;
};

declare global {
  interface Window {
    autosheets?: Bridge;
  }
}

function getBridge(): Bridge {
  if (typeof window === 'undefined' || !window.autosheets) {
    throw new Error(
      'IPC bridge unavailable. The renderer must run inside the Electron shell (window.autosheets is undefined).',
    );
  }
  return window.autosheets;
}

export function ipc<C extends IpcChannel>(
  channel: C,
  payload: IpcRequest<C>,
): Promise<IpcResponse<C>> {
  return getBridge().invoke(channel, payload);
}

export const isElectron = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.autosheets);
