import { contextBridge, ipcRenderer } from 'electron';
import type { IpcChannel, IpcRequest, IpcResponse } from '../src/shared/ipc-contract';

// Single typed bridge. Renderer code goes through src/shared/ipc.ts, never
// touches window.autosheets directly.
const api = {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcRequest<C>): Promise<IpcResponse<C>> =>
    ipcRenderer.invoke(channel, payload),
};

contextBridge.exposeInMainWorld('autosheets', api);

export type AutosheetsApi = typeof api;
