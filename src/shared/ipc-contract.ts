// Single source of truth for the IPC surface between renderer and main.
// Add a channel here, then implement it in electron/ipc/handlers.ts.

export type AppInfo = {
  version: string;
  platform: 'darwin' | 'macos' | 'win32' | 'linux' | string;
  dataDir: string;
};

export type User = {
  id: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
  createdAt: string;
};

export type ProjectMember = User & { addedAt: string };

export type AgentStatus = {
  running: boolean;
  startedAt: string | null;
  lastObservationAt: string | null;
  pendingObservations: number;
  lastError: string | null;
};

export type ClassificationStats = {
  observations: number;
  classified: number;
  skipped: number;
  errors: number;
};

export type LLMHealth =
  | { ok: true; model: string }
  | { ok: false; error: string };

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  categoryCount: number;
};

export type Category = {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  createdAt: string;
};

export type TimeEntrySource = 'agent' | 'manual';

// A row in the weekly timesheet grid: one (project, category) pair with a
// per-day duration. `cells` always has 7 entries aligned to `WeekGrid.days`.
export type WeekGridRow = {
  projectId: string;
  projectName: string;
  categoryId: string;
  categoryName: string;
  // Seconds logged on each day of the week (index aligned to WeekGrid.days).
  cells: number[];
  // True for a day if any unconfirmed agent entry contributes to that cell —
  // lets the UI flag "AI suggested, review me" cells.
  agentCells: boolean[];
};

export type WeekGrid = {
  // ISO calendar date (YYYY-MM-DD) of the Monday that starts the week.
  weekStart: string;
  // The 7 ISO calendar dates Mon..Sun.
  days: string[];
  rows: WeekGridRow[];
};

export type TimeEntry = {
  id: string;
  projectId: string;
  projectName: string;
  categoryId: string;
  categoryName: string;
  startedAt: string;
  endedAt: string;
  // Actual time spent (sum of session durations). Decoupled from end-start
  // because same-day-same-category consolidation produces entries whose
  // start/end span the whole day but whose real working time is smaller.
  durationSeconds: number;
  source: TimeEntrySource;
  confidence: number | null;
  confirmed: boolean;
  note: string | null;
  createdAt: string;
};

export type DashboardProjectShare = {
  projectId: string;
  projectName: string;
  minutes: number;
};

export type DashboardSummary = {
  monthStart: string;
  monthEnd: string;
  totalMinutes: number;
  byProject: DashboardProjectShare[];
  recentEntries: TimeEntry[];
  totalEntries: number;
  agentEntries: number;
  manualEntries: number;
  unconfirmedAgentEntries: number;
  averageAgentConfidence: number | null; // 0..1, or null if no agent entries
};

// Map of channel name -> { request, response }.
export type IpcContract = {
  'app:info': { request: void; response: AppInfo };

  'agent:status': { request: void; response: AgentStatus };
  'agent:start': { request: void; response: AgentStatus };
  'agent:stop': { request: void; response: AgentStatus };
  'agent:classifyNow': { request: void; response: ClassificationStats };
  'agent:llmHealth': { request: void; response: LLMHealth };

  'users:list': { request: void; response: User[] };
  'users:create': { request: { name: string; email: string; isAdmin?: boolean }; response: User };
  'users:delete': { request: { id: string }; response: void };
  'users:current': { request: void; response: User | null };

  'auth:login': { request: { email: string }; response: User };
  'auth:logout': { request: void; response: void };
  'auth:signup': { request: { name: string; email: string }; response: User };

  'projectMembers:list': { request: { projectId: string }; response: ProjectMember[] };
  'projectMembers:add': { request: { projectId: string; userId: string }; response: ProjectMember };
  'projectMembers:remove': { request: { projectId: string; userId: string }; response: void };

  'projects:list': { request: void; response: Project[] };
  'projects:create': { request: { name: string }; response: Project };
  'projects:delete': { request: { id: string }; response: void };

  'categories:list': { request: void; response: Category[] };
  'categories:listForProject': { request: { projectId: string }; response: Category[] };
  'categories:create': { request: { projectId: string; name: string }; response: Category };
  'categories:delete': { request: { id: string }; response: void };

  'dashboard:summary': { request: { month?: string } | void; response: DashboardSummary };

  'timeEntries:listForDate': { request: { date: string }; response: TimeEntry[] };
  'timeEntries:confirm': { request: { id: string }; response: TimeEntry };
  'timeEntries:create': {
    request: {
      projectId: string;
      categoryId: string;
      startedAt: string;
      endedAt: string;
      note?: string;
    };
    response: TimeEntry;
  };
  'timeEntries:delete': { request: { id: string }; response: void };

  // Weekly grid view. `weekStart` is the Monday (YYYY-MM-DD); the backend
  // derives the 7-day window from it.
  'timeEntries:weekGrid': { request: { weekStart: string }; response: WeekGrid };
  // Sets the total time for one grid cell — (project, category, calendar day).
  // Replaces whatever entries existed for that cell with a single manual,
  // pre-confirmed entry of `durationSeconds` (or clears it if 0).
  'timeEntries:setCell': {
    request: {
      projectId: string;
      categoryId: string;
      date: string; // YYYY-MM-DD
      durationSeconds: number;
    };
    response: void;
  };
};

export type IpcChannel = keyof IpcContract;
export type IpcRequest<C extends IpcChannel> = IpcContract[C]['request'];
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response'];
