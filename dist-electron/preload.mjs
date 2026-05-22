import { contextBridge, ipcRenderer } from "electron";
//#region electron/preload.ts
contextBridge.exposeInMainWorld("autosheets", { invoke: (channel, payload) => ipcRenderer.invoke(channel, payload) });
//#endregion
