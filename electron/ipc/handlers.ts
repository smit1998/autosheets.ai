import { app, type IpcMain } from 'electron';
import type { IpcChannel, IpcContract } from '../../src/shared/ipc-contract';
import { agentState, startAgent, stopAgent, classifyNow, probeLLM } from '../agent';
import {
  listProjects,
  createProject,
  deleteProject,
} from '../repositories/projects';
import {
  listCategories,
  listCategoriesForProject,
  createCategory,
  deleteCategory,
} from '../repositories/categories';
import {
  listTimeEntriesForDate,
  createTimeEntry,
  deleteTimeEntry,
  confirmTimeEntry,
  getWeekGrid,
  setWeekCell,
} from '../repositories/timeEntries';
import { getDashboardSummary } from '../repositories/dashboard';
import { listUsers, createUser, deleteUser } from '../repositories/users';
import {
  listProjectMembers,
  addProjectMember,
  removeProjectMember,
} from '../repositories/projectMembers';
import {
  getCurrentUser,
  loginByEmail,
  clearCurrentUser,
  signup,
} from '../repositories/settings';

type Handler<C extends IpcChannel> = (
  payload: IpcContract[C]['request'],
) => IpcContract[C]['response'] | Promise<IpcContract[C]['response']>;

type HandlerMap = { [C in IpcChannel]: Handler<C> };

const handlers: HandlerMap = {
  'app:info': () => ({
    version: app.getVersion(),
    platform: process.platform,
    dataDir: app.getPath('userData'),
  }),

  'agent:status': () => agentState(),
  'agent:start': () => startAgent(),
  'agent:stop': () => stopAgent(),
  'agent:classifyNow': () => classifyNow(),
  'agent:llmHealth': () => probeLLM(),

  'users:list': () => listUsers(),
  'users:create': (payload) => createUser(payload),
  'users:delete': (payload) => deleteUser(payload),
  'users:current': () => getCurrentUser(),

  'auth:login': ({ email }) => loginByEmail(email),
  'auth:logout': () => {
    clearCurrentUser();
  },
  'auth:signup': (payload) => signup(payload),

  'projects:list': () => listProjects(),
  'projects:create': (payload) => createProject(payload),
  'projects:delete': (payload) => deleteProject(payload),

  'projectMembers:list': (payload) => listProjectMembers(payload),
  'projectMembers:add': (payload) => addProjectMember(payload),
  'projectMembers:remove': (payload) => removeProjectMember(payload),

  'categories:list': () => listCategories(),
  'categories:listForProject': (payload) => listCategoriesForProject(payload),
  'categories:create': (payload) => createCategory(payload),
  'categories:delete': (payload) => deleteCategory(payload),

  'dashboard:summary': (payload) => getDashboardSummary(payload || undefined),

  'timeEntries:listForDate': (payload) => listTimeEntriesForDate(payload),
  'timeEntries:confirm': (payload) => confirmTimeEntry(payload),
  'timeEntries:create': (payload) => createTimeEntry(payload),
  'timeEntries:delete': (payload) => deleteTimeEntry(payload),
  'timeEntries:weekGrid': (payload) => getWeekGrid(payload),
  'timeEntries:setCell': (payload) => setWeekCell(payload),
};

export function registerIpcHandlers(ipcMain: IpcMain): void {
  (Object.keys(handlers) as IpcChannel[]).forEach((channel) => {
    ipcMain.handle(channel, (_event, payload) =>
      (handlers[channel] as Handler<typeof channel>)(payload),
    );
  });
}
