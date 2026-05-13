var e=Object.create,t=Object.defineProperty,n=Object.getOwnPropertyDescriptor,r=Object.getOwnPropertyNames,i=Object.getPrototypeOf,a=Object.prototype.hasOwnProperty,o=(e,i,o,s)=>{if(i&&typeof i==`object`||typeof i==`function`)for(var c=r(i),l=0,u=c.length,d;l<u;l++)d=c[l],!a.call(e,d)&&d!==o&&t(e,d,{get:(e=>i[e]).bind(null,d),enumerable:!(s=n(i,d))||s.enumerable});return e},s=(n,r,a)=>(a=n==null?{}:e(i(n)),o(r||!n||!n.__esModule?t(a,`default`,{value:n,enumerable:!0}):a,n));let c=require(`electron`),l=require(`node:path`);l=s(l,1);let u=require(`node:child_process`),d=require(`node:util`),f=require(`better-sqlite3`);f=s(f,1);let p=require(`node:fs`);p=s(p,1);let m=require(`node:crypto`);var h=null,g=`Admin`,_=`admin@autosheets.local`,ee=`
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT,
  is_admin    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Email is the login identifier. UNIQUE allows multiple NULLs in SQLite,
-- which lets older rows that pre-date the constraint coexist; new rows are
-- validated by the repository to ensure email is set and unique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_categories_project ON categories(project_id);

CREATE TABLE IF NOT EXISTS project_members (
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS observations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
  started_at        TEXT NOT NULL,
  ended_at          TEXT,
  app               TEXT,
  window_title      TEXT,
  url               TEXT,
  metadata          TEXT,
  classified_entry_id TEXT REFERENCES time_entries(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_observations_started ON observations(started_at);
-- Indexes that reference user_id / classified_entry_id are created in migrate()
-- after the ALTER TABLE, so older databases (which predate those columns)
-- don't fail the SCHEMA pass.

CREATE TABLE IF NOT EXISTS time_entries (
  id               TEXT PRIMARY KEY,
  user_id          TEXT REFERENCES users(id) ON DELETE SET NULL,
  project_id       TEXT NOT NULL REFERENCES projects(id),
  category_id      TEXT NOT NULL REFERENCES categories(id),
  started_at       TEXT NOT NULL,
  ended_at         TEXT NOT NULL,
  -- Actual time spent within the entry. Decoupled from (ended_at - started_at)
  -- because the same-day-same-category consolidation can merge non-adjacent
  -- sessions: started_at/ended_at then bracket the entire day but the real
  -- working time is the sum of individual session durations.
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  source           TEXT NOT NULL CHECK (source IN ('agent', 'manual')),
  confidence       REAL,
  confirmed        INTEGER NOT NULL DEFAULT 0,
  note             TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_entries_started ON time_entries(started_at);
CREATE INDEX IF NOT EXISTS idx_entries_project ON time_entries(project_id);
`;function te(e){let t=e.prepare(`PRAGMA table_info(time_entries)`).all();t.some(e=>e.name===`user_id`)||e.exec(`ALTER TABLE time_entries ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL`),t.some(e=>e.name===`duration_seconds`)||(e.exec(`ALTER TABLE time_entries ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 0`),e.exec(`UPDATE time_entries
          SET duration_seconds = CAST((julianday(ended_at) - julianday(started_at)) * 86400 AS INTEGER)
        WHERE duration_seconds = 0`)),e.exec(`CREATE INDEX IF NOT EXISTS idx_entries_user ON time_entries(user_id)`);let n=e.prepare(`PRAGMA table_info(observations)`).all();n.some(e=>e.name===`user_id`)||e.exec(`ALTER TABLE observations ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL`),n.some(e=>e.name===`classified_entry_id`)||e.exec(`ALTER TABLE observations ADD COLUMN classified_entry_id TEXT REFERENCES time_entries(id) ON DELETE SET NULL`),e.exec(`CREATE INDEX IF NOT EXISTS idx_observations_user ON observations(user_id)`),e.exec(`CREATE INDEX IF NOT EXISTS idx_observations_unclassified
       ON observations(user_id, classified_entry_id) WHERE classified_entry_id IS NULL`),e.prepare(`UPDATE users SET email = ? WHERE name = ? AND is_admin = 1 AND (email IS NULL OR email = '')`).run(_,g)}function ne(e){if(e.prepare(`SELECT COUNT(*) AS n FROM users`).get().n===0){let t=(0,m.randomUUID)();e.prepare(`INSERT INTO users (id, name, email, is_admin) VALUES (?, ?, ?, 1)`).run(t,g,_)}}function re(){if(h)return h;let e=c.app.getPath(`userData`);return p.default.mkdirSync(e,{recursive:!0}),h=new f.default(l.default.join(e,`autosheets.db`)),h.pragma(`journal_mode = WAL`),h.pragma(`foreign_keys = ON`),h.exec(ee),te(h),ne(h),h}function v(){if(!h)throw Error(`Database not initialized — call initDatabase() first.`);return h}function ie(){h?.close(),h=null}function ae(e){return{id:e.id,userId:e.user_id,startedAt:e.started_at,endedAt:e.ended_at,app:e.app,windowTitle:e.window_title,url:e.url}}function oe(e){let t=v().prepare(`INSERT INTO observations (user_id, started_at, ended_at, app, window_title, url)
       VALUES (?, ?, ?, ?, ?, ?)`).run(e.userId,e.startedAt,e.endedAt,e.app,e.windowTitle,e.url);return Number(t.lastInsertRowid)}function se(e,t=200){return v().prepare(`SELECT id, user_id, started_at, ended_at, app, window_title, url
         FROM observations
        WHERE user_id = ? AND classified_entry_id IS NULL
        ORDER BY started_at
        LIMIT ?`).all(e,t).map(ae)}function y(e,t){if(e.length===0)return;let n=e.map(()=>`?`).join(`,`);v().prepare(`UPDATE observations SET classified_entry_id = ? WHERE id IN (${n})`).run(t,...e)}var ce=(0,d.promisify)(u.execFile);function le(){return l.default.join(c.app.getAppPath(),`node_modules`,`active-win`,`main`)}async function ue(e){try{let{stdout:t}=await ce(e,[],{timeout:4e3,env:process.env}),n=t.trim();if(!n)return{app:null,title:null,url:null};let r=JSON.parse(n);return{app:r.owner?.name??null,title:r.title??null,url:r.url??null}}catch(e){let t=e,n=(t.stderr??``).trim();throw Error(n||(t.message??String(e)))}}var de=class{userId;intervalMs;minDurationSeconds;onError;timer=null;active=null;lastObservationAt=null;lastError=null;binaryPath=null;constructor(e){this.userId=e.userId,this.intervalMs=e.intervalMs??2e4,this.minDurationSeconds=e.minDurationSeconds??5,this.onError=e.onError??(()=>{})}isRunning(){return this.timer!==null}getLastObservationAt(){return this.lastObservationAt}getLastError(){return this.lastError}start(){this.timer||=(this.tick(),setInterval(()=>void this.tick(),this.intervalMs))}async stop(){this.timer&&=(clearInterval(this.timer),null),this.flushActive(new Date)}flushPending(){this.flushActive(new Date)}async tick(){try{let e=await this.sample(),t=e.at;fe(this.active,e)?this.active&&(this.active.lastSeenAt=t):(this.flushActive(t),this.active={app:e.app,windowTitle:e.windowTitle,url:e.url,startedAt:t,lastSeenAt:t}),this.lastObservationAt=t,this.lastError=null}catch(e){this.lastError=e instanceof Error?e.message:String(e),this.onError(e)}}async sample(){this.binaryPath||=le();let e=await ue(this.binaryPath);return{app:e.app,windowTitle:e.title,url:e.url,at:new Date}}flushActive(e){let t=this.active;if(t){if((t.lastSeenAt.getTime()-t.startedAt.getTime())/1e3>=this.minDurationSeconds)try{oe({userId:this.userId,startedAt:t.startedAt.toISOString(),endedAt:e.toISOString(),app:t.app,windowTitle:t.windowTitle,url:t.url})}catch(e){this.onError(e)}this.active=null}}};function fe(e,t){return e?e.app===t.app&&e.windowTitle===t.windowTitle:!1}var pe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;function b(e){return{id:e.id,name:e.name,email:e.email,isAdmin:e.is_admin===1,createdAt:e.created_at}}function me(){return v().prepare(`SELECT id, name, email, is_admin, created_at FROM users ORDER BY is_admin DESC, name`).all().map(b)}function x(e){let t=v().prepare(`SELECT id, name, email, is_admin, created_at FROM users WHERE id = ?`).get(e);return t?b(t):null}function S(e){let t=e.trim().toLowerCase();if(!t)return null;let n=v().prepare(`SELECT id, name, email, is_admin, created_at FROM users WHERE LOWER(email) = ? LIMIT 1`).get(t);return n?b(n):null}function C({name:e,email:t,isAdmin:n}){let r=e.trim();if(!r)throw Error(`Name is required.`);let i=t?.trim().toLowerCase();if(!i)throw Error(`Email is required.`);if(!pe.test(i))throw Error(`Email is not valid.`);if(S(i))throw Error(`A user with this email already exists.`);let a=(0,m.randomUUID)();return v().prepare(`INSERT INTO users (id, name, email, is_admin) VALUES (?, ?, ?, ?)`).run(a,r,i,+!!n),x(a)}function he({id:e}){let t=v(),n=t.prepare(`SELECT COUNT(*) AS n FROM users WHERE is_admin = 1`).get(),r=t.prepare(`SELECT is_admin FROM users WHERE id = ?`).get(e);if(!r)throw Error(`User not found.`);if(r.is_admin===1&&n.n<=1)throw Error(`Cannot delete the last admin user.`);t.prepare(`DELETE FROM users WHERE id = ?`).run(e)}var w=`current_user_id`;function T(){let e=v().prepare(`SELECT value FROM app_settings WHERE key = ?`).get(w);return e?.value?x(e.value)||(D(),null):null}function E(){let e=T();if(!e)throw Error(`Not signed in.`);return e}function ge(e){let t=S(e);if(!t)throw Error(`No account found for that email.`);return v().prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run(w,t.id),t}function D(){v().prepare(`DELETE FROM app_settings WHERE key = ?`).run(w)}function _e({name:e,email:t}){let n=C({name:e,email:t,isAdmin:!1});return v().prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run(w,n.id),n}var O=`
    p.id,
    p.name,
    p.created_at,
    (SELECT COUNT(*) FROM categories c WHERE c.project_id = p.id) AS category_count
`;function k(e){return{id:e.id,name:e.name,createdAt:e.created_at,categoryCount:e.category_count}}function A(){let e=E(),t=v();return e.isAdmin?t.prepare(`SELECT ${O} FROM projects p ORDER BY p.created_at DESC`).all().map(k):t.prepare(`SELECT ${O}
         FROM projects p
         JOIN project_members m ON m.project_id = p.id
         WHERE m.user_id = ?
         ORDER BY p.created_at DESC`).all(e.id).map(k)}function ve({name:e}){let t=e.trim();if(!t)throw Error(`Project name is required.`);let n=(0,m.randomUUID)(),r=v();r.prepare(`INSERT INTO projects (id, name) VALUES (?, ?)`).run(n,t);let i=E();return r.prepare(`INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)`).run(n,i.id),k(r.prepare(`SELECT ${O} FROM projects p WHERE p.id = ?`).get(n))}function ye({id:e}){let t=v();if(t.prepare(`SELECT 1 FROM time_entries WHERE project_id = ? LIMIT 1`).get(e))throw Error(`Cannot delete a project that has time entries.`);t.prepare(`DELETE FROM projects WHERE id = ?`).run(e)}var j=`
  SELECT
    c.id,
    c.project_id,
    p.name AS project_name,
    c.name,
    c.created_at
  FROM categories c
  JOIN projects p ON p.id = c.project_id
`;function M(e){return{id:e.id,projectId:e.project_id,projectName:e.project_name,name:e.name,createdAt:e.created_at}}function be(){let e=E(),t=v();return e.isAdmin?t.prepare(`${j} ORDER BY p.name, c.created_at DESC`).all().map(M):t.prepare(`${j}
       JOIN project_members m ON m.project_id = c.project_id
       WHERE m.user_id = ?
       ORDER BY p.name, c.created_at DESC`).all(e.id).map(M)}function N({projectId:e}){return v().prepare(`${j} WHERE c.project_id = ? ORDER BY c.created_at DESC`).all(e).map(M)}function xe({projectId:e,name:t}){if(!E().isAdmin)throw Error(`Only admins can manage categories.`);let n=t.trim();if(!n)throw Error(`Category name is required.`);let r=v();if(!r.prepare(`SELECT 1 FROM projects WHERE id = ?`).get(e))throw Error(`Project not found.`);let i=(0,m.randomUUID)();return r.prepare(`INSERT INTO categories (id, project_id, name) VALUES (?, ?, ?)`).run(i,e,n),M(r.prepare(`${j} WHERE c.id = ?`).get(i))}function Se({id:e}){if(!E().isAdmin)throw Error(`Only admins can manage categories.`);let t=v();if(t.prepare(`SELECT 1 FROM time_entries WHERE category_id = ? LIMIT 1`).get(e))throw Error(`Cannot delete a category that has time entries.`);t.prepare(`DELETE FROM categories WHERE id = ?`).run(e)}var P=.4,F=10*6e4;async function Ce(e){let t={observations:0,classified:0,skipped:0,errors:0},n=se(e.userId,e.maxObservations??50);if(t.observations=n.length,n.length===0){let n=L(e.userId);return n>0&&console.log(`[classifier] consolidation merged away ${n} entries`),t}let r=A();if(r.length===0)return t.skipped=n.length,t;let i=r.map(e=>({projectId:e.id,projectName:e.name,categories:N({projectId:e.id}).map(e=>({id:e.id,name:e.name}))})),a=n.map((e,t)=>({index:t,app:e.app,windowTitle:e.windowTitle,url:e.url,durationSeconds:I(e)})),o;try{o=await e.llm.classify({observations:a,options:i})}catch(e){throw t.errors=n.length,e}let s=new Map(o.map(e=>[e.index,e])),c=[],l=null;n.forEach((e,n)=>{let r=s.get(n),i=we(r);if(i){De(e,i,r),t.skipped+=1,l=null;return}let a=r;l&&Te(l,a,e)?(l.observations.push(e),l.confidenceSum+=a.confidence,a.reasoning&&l.reasonings.push(a.reasoning),l.endedAt=e.endedAt,l.durationSeconds+=I(e)):(l={projectId:a.projectId,categoryId:a.categoryId,observations:[e],startedAt:e.startedAt,endedAt:e.endedAt,durationSeconds:I(e),confidenceSum:a.confidence,reasonings:a.reasoning?[a.reasoning]:[]},c.push(l))});let u=v(),d=u.prepare(`INSERT INTO time_entries
       (id, user_id, project_id, category_id, started_at, ended_at, duration_seconds, source, confidence, confirmed, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'agent', ?, 0, ?)`),f=u.prepare(`SELECT id, ended_at AS endedAt, confidence, duration_seconds AS durationSeconds
       FROM time_entries
      WHERE user_id = ?
        AND project_id = ?
        AND category_id = ?
        AND source = 'agent'
        AND confirmed = 0
      ORDER BY ended_at DESC
      LIMIT 1`),p=u.prepare(`UPDATE time_entries
        SET ended_at = ?,
            duration_seconds = duration_seconds + ?,
            confidence = ?
      WHERE id = ?`);u.transaction(n=>{n.forEach(n=>{let r=n.confidenceSum/n.observations.length,i=f.get(e.userId,n.projectId,n.categoryId);if(i){let e=new Date(n.startedAt).getTime()-new Date(i.endedAt).getTime();if(e>=-1e3&&e<=F){let e=Math.min(i.confidence??r,r);p.run(n.endedAt,n.durationSeconds,e,i.id),y(n.observations.map(e=>e.id),i.id),t.classified+=n.observations.length;return}}let a=(0,m.randomUUID)();d.run(a,e.userId,n.projectId,n.categoryId,n.startedAt,n.endedAt,n.durationSeconds,r,Ee(n.reasonings)),y(n.observations.map(e=>e.id),a),t.classified+=n.observations.length})})(c);let h=L(e.userId);return h>0&&console.log(`[classifier] consolidation merged away ${h} entries`),t}function I(e){return Math.max(1,Math.round((new Date(e.endedAt).getTime()-new Date(e.startedAt).getTime())/1e3))}function we(e){return e?!e.projectId||!e.categoryId?`no fit`:e.confidence<P?`low confidence ${e.confidence.toFixed(2)} < ${P}`:null:`no result for index`}function Te(e,t,n){if(e.projectId!==t.projectId||e.categoryId!==t.categoryId)return!1;let r=new Date(n.startedAt).getTime()-new Date(e.endedAt).getTime();return r>=0&&r<=F}function Ee(e){if(e.length===0)return null;let t=new Set,n=[];for(let r of e){let e=r.trim();!e||t.has(e)||(t.add(e),n.push(e))}return n.length===0?null:n.join(` · `)}function De(e,t,n){let r=n?.reasoning?`; reasoning=${n.reasoning}`:``;console.log(`[classifier] skip obs ${e.id} (${e.app} | ${e.windowTitle}): ${t}${r}`)}function Oe(e){let t=new Date(e),n=e=>String(e).padStart(2,`0`);return`${t.getFullYear()}-${n(t.getMonth()+1)}-${n(t.getDate())}`}function L(e){let t=v(),n=t.prepare(`SELECT id, project_id, category_id, started_at, ended_at, duration_seconds, confidence
       FROM time_entries
      WHERE user_id = ? AND source = 'agent' AND confirmed = 0
      ORDER BY started_at ASC`),r=t.prepare(`UPDATE time_entries
        SET started_at = ?, ended_at = ?, duration_seconds = ?, confidence = ?
      WHERE id = ?`),i=t.prepare(`UPDATE observations SET classified_entry_id = ? WHERE classified_entry_id = ?`),a=t.prepare(`DELETE FROM time_entries WHERE id = ?`),o=0;return t.transaction(()=>{let t=n.all(e),s=new Map;for(let e of t){let t=`${Oe(e.started_at)}|${e.project_id}|${e.category_id}`,n=s.get(t);n?n.push(e):s.set(t,[e])}for(let e of s.values()){if(e.length<=1)continue;e.sort((e,t)=>e.started_at.localeCompare(t.started_at));let t=e[0],n=t.started_at,s=t.ended_at,c=t.duration_seconds,l=t.confidence;for(let t=1;t<e.length;t+=1){let r=e[t];r.started_at<n&&(n=r.started_at),r.ended_at>s&&(s=r.ended_at),c+=r.duration_seconds,r.confidence!==null&&(l=l===null?r.confidence:Math.min(l,r.confidence))}r.run(n,s,c,l,t.id);for(let n=1;n<e.length;n+=1){let r=e[n];i.run(t.id,r.id),a.run(r.id),o+=1}}})(),o}var ke=`http://localhost:11434`,Ae=`qwen2.5:7b`,je=class{host;model;constructor(e={}){this.host=(e.host??`http://localhost:11434`).replace(/\/+$/,``),this.model=e.model??`qwen2.5:7b`}async probe(){try{let e=await fetch(`${this.host}/api/tags`,{method:`GET`});return e.ok?((await e.json()).models?.map(e=>e.name)??[]).some(e=>e===this.model||e.startsWith(`${this.model}:`))?{ok:!0,model:this.model}:{ok:!1,error:`Model "${this.model}" is not installed. Run: ollama pull ${this.model}`}:{ok:!1,error:`Ollama returned ${e.status}`}}catch(e){return{ok:!1,error:e instanceof Error?`Cannot reach Ollama at ${this.host}: ${e.message}`:`Cannot reach Ollama at ${this.host}`}}}async classify(e){if(e.observations.length===0)return[];if(e.options.length===0)return e.observations.map(e=>({index:e.index,projectId:null,categoryId:null,confidence:0,reasoning:`No projects available to assign.`}));let t=Me(e),n=await fetch(`${this.host}/api/generate`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({model:this.model,prompt:t,stream:!1,format:`json`,options:{temperature:.1}})});if(!n.ok)throw Error(`Ollama /api/generate returned ${n.status}: ${await n.text()}`);let r=await n.json();return console.log(`[llm] observations sent:`,JSON.stringify(e.observations)),console.log(`[llm] raw response:`,r.response),Ne(r.response,e)}};function Me(e){let t=[];e.options.forEach((e,n)=>{t.push(`Project ${n+1} ("${e.projectName}"):`),e.categories.length===0?t.push(`  (no categories defined)`):e.categories.forEach((e,n)=>{t.push(`  Category ${n+1}: ${e.name}`)})});let n=e.observations.map(e=>{let t=[`app=${JSON.stringify(e.app??``)}`,`windowTitle=${JSON.stringify(e.windowTitle??``)}`];return e.url&&t.push(`url=${JSON.stringify(e.url)}`),t.push(`durationSec=${e.durationSeconds}`),`  Observation ${e.index}: ${t.join(`, `)}`});return[`You are a timesheet classification assistant.`,``,`For each observation, pick the best matching project and category from the numbered options below. If no option is a clearly good fit, set projectIndex and categoryIndex to 0 — do not guess.`,``,`Available options (categoryIndex is numbered within each project, starting at 1):`,...t,``,`Observations:`,...n,``,`Respond ONLY with JSON of this exact shape:`,`{ "results": [ { "obsIndex": <integer>, "projectIndex": <integer 0 or 1+>, "categoryIndex": <integer 0 or 1+>, "confidence": <number between 0 and 1>, "reasoning": "<short string>" } ] }`,``,`Rules:`,`- projectIndex and categoryIndex MUST be plain integers (e.g. 1, 2, 3). Never use decimals like 1.1.`,`- categoryIndex is the 1-based position within the chosen project (or 0 if projectIndex is 0).`,`- Include exactly one entry per observation, preserving order.`,`- Use confidence < 0.5 for guesses.`,`- Match window titles to category names by intent (e.g. a YouTube tab → a "Youtube" category if available).`].join(`
`)}function Ne(e,t){let n;try{n=JSON.parse(e)}catch{throw Error(`LLM returned invalid JSON: ${e.slice(0,200)}`)}let r=n;if(!r||!Array.isArray(r.results))throw Error(`LLM response missing "results" array.`);let i=[];for(let e of r.results){let n=e;if(typeof n.obsIndex!=`number`)continue;let r=R(n.projectIndex),a=R(n.categoryIndex),o=typeof n.confidence==`number`&&n.confidence>=0&&n.confidence<=1?n.confidence:0,s=typeof n.reasoning==`string`?n.reasoning:void 0,c=null,l=null;if(r>=1&&r<=t.options.length){let e=t.options[r-1];if(e&&(c=e.projectId,a>=1&&a<=e.categories.length)){let t=e.categories[a-1];t&&(l=t.id)}}c&&!l&&(c=null),i.push({index:n.obsIndex,projectId:c,categoryId:l,confidence:o,reasoning:s})}return i}function R(e){if(typeof e!=`number`||!Number.isFinite(e))return 0;let t=Math.floor(e);return t>=0?t:0}var z=null,B=null,V=null,H=null,U=new je({host:ke,model:Ae}),Pe=5*6e4;function Fe(e){return e?v().prepare(`SELECT COUNT(*) AS n FROM observations
        WHERE user_id = ? AND classified_entry_id IS NULL`).get(e).n:0}function W(){let e=z?.isRunning()??!1,t=T();return{running:e,startedAt:B,lastObservationAt:z?.getLastObservationAt()?.toISOString()??null,pendingObservations:Fe(t?.id??null),lastError:z?.getLastError()??null}}function Ie(){let e=T();if(!e)throw Error(`Sign in before starting the agent.`);return z?.isRunning()?W():(z=new de({userId:e.id,onError:e=>{console.error(`[agent] observation error:`,e)}}),z.start(),B=new Date().toISOString(),ze(),W())}async function Le(){return Be(),z&&=(await z.stop(),null),B=null,W()}async function Re(){let e=T();if(!e)throw Error(`Sign in before running classification.`);return z?.flushPending(),G(e.id)}function ze(){V||=setInterval(()=>{Ve()},Pe)}function Be(){V&&=(clearInterval(V),null)}async function Ve(){let e=T();if(e){z?.flushPending();try{let t=await G(e.id);t.observations>0&&console.log(`[agent] auto-classify: classified ${t.classified}/${t.observations}, skipped ${t.skipped}`)}catch(e){console.error(`[agent] auto-classify failed:`,e)}}}async function G(e){return H||(H=(async()=>{try{return await Ce({userId:e,llm:U})}finally{H=null}})(),H)}async function He(){return U.probe()}var K=`
  SELECT
    e.id,
    e.project_id,
    p.name AS project_name,
    e.category_id,
    c.name AS category_name,
    e.started_at,
    e.ended_at,
    e.duration_seconds,
    e.source,
    e.confidence,
    e.confirmed,
    e.note,
    e.created_at
  FROM time_entries e
  JOIN projects p ON p.id = e.project_id
  JOIN categories c ON c.id = e.category_id
`;function q(e){return{id:e.id,projectId:e.project_id,projectName:e.project_name,categoryId:e.category_id,categoryName:e.category_name,startedAt:e.started_at,endedAt:e.ended_at,durationSeconds:e.duration_seconds,source:e.source,confidence:e.confidence,confirmed:e.confirmed===1,note:e.note,createdAt:e.created_at}}function Ue({date:e}){let t=E(),n=`${e}T00:00:00.000Z`,r=`${e}T23:59:59.999Z`;return v().prepare(`${K}
       WHERE e.user_id = ? AND e.started_at >= ? AND e.started_at <= ?
       ORDER BY e.started_at`).all(t.id,n,r).map(q)}function We(e){let t=new Date(e.startedAt).getTime(),n=new Date(e.endedAt).getTime();if(n<=t)throw Error(`End time must be after start time.`);let r=E(),i=v(),a=i.prepare(`SELECT project_id FROM categories WHERE id = ?`).get(e.categoryId);if(!a)throw Error(`Category not found.`);if(a.project_id!==e.projectId)throw Error(`Selected category does not belong to the selected project.`);if(!r.isAdmin&&!i.prepare(`SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?`).get(e.projectId,r.id))throw Error(`You are not a member of this project.`);let o=(0,m.randomUUID)(),s=Math.round((n-t)/1e3);return i.prepare(`INSERT INTO time_entries
       (id, user_id, project_id, category_id, started_at, ended_at, duration_seconds, source, confirmed, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', 1, ?)`).run(o,r.id,e.projectId,e.categoryId,e.startedAt,e.endedAt,s,e.note??null),q(i.prepare(`${K} WHERE e.id = ?`).get(o))}function Ge({id:e}){let t=E(),n=v(),r=n.prepare(`SELECT user_id FROM time_entries WHERE id = ?`).get(e);if(!r)throw Error(`Entry not found.`);if(!t.isAdmin&&r.user_id!==t.id)throw Error(`You can only confirm your own entries.`);return n.prepare(`UPDATE time_entries SET confirmed = 1 WHERE id = ?`).run(e),q(n.prepare(`${K} WHERE e.id = ?`).get(e))}function Ke({id:e}){let t=E(),n=v(),r=n.prepare(`SELECT user_id FROM time_entries WHERE id = ?`).get(e);if(r){if(!t.isAdmin&&r.user_id!==t.id)throw Error(`You can only delete your own entries.`);n.prepare(`DELETE FROM time_entries WHERE id = ?`).run(e)}}function qe(e){let t=new Date(e),n=e=>String(e).padStart(2,`0`);return`${t.getFullYear()}-${n(t.getMonth()+1)}-${n(t.getDate())}`}function Je(e,t){let n=new Date(`${e}T00:00:00`);n.setDate(n.getDate()+t);let r=e=>String(e).padStart(2,`0`);return`${n.getFullYear()}-${r(n.getMonth()+1)}-${r(n.getDate())}`}function Ye({weekStart:e}){let t=E(),n=v(),r=Array.from({length:7},(t,n)=>Je(e,n)),i=n.prepare(`SELECT
         e.project_id, p.name AS project_name,
         e.category_id, c.name AS category_name,
         e.started_at, e.duration_seconds, e.source, e.confirmed
       FROM time_entries e
       JOIN projects p ON p.id = e.project_id
       JOIN categories c ON c.id = e.category_id
       WHERE e.user_id = ?
         AND date(e.started_at, 'localtime') >= ?
         AND date(e.started_at, 'localtime') <= ?`).all(t.id,r[0],r[6]),a=new Map(r.map((e,t)=>[e,t])),o=new Map;for(let e of i){let t=a.get(qe(e.started_at));if(t===void 0)continue;let n=`${e.project_id}|${e.category_id}`,r=o.get(n);r||(r={projectId:e.project_id,projectName:e.project_name,categoryId:e.category_id,categoryName:e.category_name,cells:Array.from({length:7},()=>0),agentCells:Array.from({length:7},()=>!1)},o.set(n,r)),r.cells[t]+=e.duration_seconds,e.source===`agent`&&e.confirmed===0&&(r.agentCells[t]=!0)}return{weekStart:e,days:r,rows:Array.from(o.values()).sort((e,t)=>e.projectName.localeCompare(t.projectName)||e.categoryName.localeCompare(t.categoryName))}}function Xe(e){let t=E(),n=v(),r=n.prepare(`SELECT project_id FROM categories WHERE id = ?`).get(e.categoryId);if(!r)throw Error(`Category not found.`);if(r.project_id!==e.projectId)throw Error(`Selected category does not belong to the selected project.`);if(!t.isAdmin&&!n.prepare(`SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?`).get(e.projectId,t.id))throw Error(`You are not a member of this project.`);let i=Math.max(0,Math.round(e.durationSeconds)),a=n.prepare(`DELETE FROM time_entries
       WHERE user_id = ? AND project_id = ? AND category_id = ?
         AND date(started_at, 'localtime') = ?`),o=n.prepare(`INSERT INTO time_entries
       (id, user_id, project_id, category_id, started_at, ended_at, duration_seconds, source, confidence, confirmed, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', NULL, 1, NULL)`);n.transaction(()=>{if(a.run(t.id,e.projectId,e.categoryId,e.date),i>0){let n=new Date(`${e.date}T12:00:00`).toISOString(),r=new Date(new Date(n).getTime()+i*1e3).toISOString();o.run((0,m.randomUUID)(),t.id,e.projectId,e.categoryId,n,r,i)}})()}var Ze=8;function Qe(e){return{id:e.id,projectId:e.project_id,projectName:e.project_name,categoryId:e.category_id,categoryName:e.category_name,startedAt:e.started_at,endedAt:e.ended_at,durationSeconds:e.duration_seconds,source:e.source,confidence:e.confidence,confirmed:e.confirmed===1,note:e.note,createdAt:e.created_at}}function $e(e){let t,n;if(e&&/^\d{4}-\d{2}$/.test(e))[t,n]=e.split(`-`).map(Number);else{let e=new Date;t=e.getFullYear(),n=e.getMonth()+1}return{start:new Date(t,n-1,1,0,0,0,0).toISOString(),end:new Date(t,n,0,23,59,59,999).toISOString()}}function et(e){let t=E(),n=v(),{start:r,end:i}=$e(e?.month),a=n.prepare(`SELECT
         e.project_id,
         p.name AS project_name,
         CAST(SUM(e.duration_seconds) / 60 AS INTEGER) AS minutes
       FROM time_entries e
       JOIN projects p ON p.id = e.project_id
       WHERE e.user_id = ? AND e.started_at >= ? AND e.started_at <= ?
       GROUP BY e.project_id
       ORDER BY minutes DESC`).all(t.id,r,i).map(e=>({projectId:e.project_id,projectName:e.project_name,minutes:e.minutes??0})),o=a.reduce((e,t)=>e+t.minutes,0),s=n.prepare(`SELECT
         e.id,
         e.project_id,
         p.name AS project_name,
         e.category_id,
         c.name AS category_name,
         e.started_at,
         e.ended_at,
         e.duration_seconds,
         e.source,
         e.confidence,
         e.confirmed,
         e.note,
         e.created_at
       FROM time_entries e
       JOIN projects p ON p.id = e.project_id
       JOIN categories c ON c.id = e.category_id
       WHERE e.user_id = ? AND e.started_at >= ? AND e.started_at <= ?
       ORDER BY e.started_at DESC
       LIMIT ?`).all(t.id,r,i,Ze).map(Qe),c=n.prepare(`SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN source = 'agent' THEN 1 ELSE 0 END) AS agent_total,
         SUM(CASE WHEN source = 'manual' THEN 1 ELSE 0 END) AS manual_total,
         SUM(CASE WHEN source = 'agent' AND confirmed = 0 THEN 1 ELSE 0 END) AS unconfirmed,
         AVG(CASE WHEN source = 'agent' THEN confidence ELSE NULL END) AS avg_agent_conf
       FROM time_entries
       WHERE user_id = ? AND started_at >= ? AND started_at <= ?`).get(t.id,r,i);return{monthStart:r,monthEnd:i,totalMinutes:o,byProject:a,recentEntries:s,totalEntries:c.total??0,agentEntries:c.agent_total??0,manualEntries:c.manual_total??0,unconfirmedAgentEntries:c.unconfirmed??0,averageAgentConfidence:c.avg_agent_conf}}function J(e){return{id:e.id,name:e.name,email:e.email,isAdmin:e.is_admin===1,createdAt:e.created_at,addedAt:e.added_at}}var Y=`
  SELECT u.id, u.name, u.email, u.is_admin, u.created_at, m.added_at
  FROM project_members m
  JOIN users u ON u.id = m.user_id
`;function tt({projectId:e}){return v().prepare(`${Y} WHERE m.project_id = ? ORDER BY u.name`).all(e).map(J)}function nt({projectId:e,userId:t}){let n=v();if(!n.prepare(`SELECT 1 FROM projects WHERE id = ?`).get(e))throw Error(`Project not found.`);if(!n.prepare(`SELECT 1 FROM users WHERE id = ?`).get(t))throw Error(`User not found.`);return n.prepare(`INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)`).run(e,t),J(n.prepare(`${Y} WHERE m.project_id = ? AND m.user_id = ?`).get(e,t))}function rt({projectId:e,userId:t}){v().prepare(`DELETE FROM project_members WHERE project_id = ? AND user_id = ?`).run(e,t)}var X={"app:info":()=>({version:c.app.getVersion(),platform:process.platform,dataDir:c.app.getPath(`userData`)}),"agent:status":()=>W(),"agent:start":()=>Ie(),"agent:stop":()=>Le(),"agent:classifyNow":()=>Re(),"agent:llmHealth":()=>He(),"users:list":()=>me(),"users:create":e=>C(e),"users:delete":e=>he(e),"users:current":()=>T(),"auth:login":({email:e})=>ge(e),"auth:logout":()=>{D()},"auth:signup":e=>_e(e),"projects:list":()=>A(),"projects:create":e=>ve(e),"projects:delete":e=>ye(e),"projectMembers:list":e=>tt(e),"projectMembers:add":e=>nt(e),"projectMembers:remove":e=>rt(e),"categories:list":()=>be(),"categories:listForProject":e=>N(e),"categories:create":e=>xe(e),"categories:delete":e=>Se(e),"dashboard:summary":e=>et(e||void 0),"timeEntries:listForDate":e=>Ue(e),"timeEntries:confirm":e=>Ge(e),"timeEntries:create":e=>We(e),"timeEntries:delete":e=>Ke(e),"timeEntries:weekGrid":e=>Ye(e),"timeEntries:setCell":e=>Xe(e)};function it(e){Object.keys(X).forEach(t=>{e.handle(t,(e,n)=>X[t](n))})}process.env.APP_ROOT=l.default.join(__dirname,`..`);var Z=process.env.VITE_DEV_SERVER_URL,Q=l.default.join(process.env.APP_ROOT,`dist`);process.env.VITE_PUBLIC=Z?l.default.join(process.env.APP_ROOT,`public`):Q;var $=null;function at(){$=new c.BrowserWindow({width:1440,height:900,minWidth:1024,minHeight:640,backgroundColor:`#0b1326`,titleBarStyle:process.platform===`darwin`?`hiddenInset`:`default`,webPreferences:{preload:l.default.join(__dirname,`preload.mjs`),contextIsolation:!0,nodeIntegration:!1,sandbox:!1}}),Z?$.loadURL(Z):$.loadFile(l.default.join(Q,`index.html`))}c.app.whenReady().then(()=>{re(),it(c.ipcMain),at(),c.app.on(`activate`,()=>{c.BrowserWindow.getAllWindows().length===0&&at()})}),c.app.on(`window-all-closed`,()=>{process.platform!==`darwin`&&(ie(),c.app.quit(),$=null)}),c.app.on(`before-quit`,()=>{ie()});