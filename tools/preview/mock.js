// The fake Tauri backend inside the page, for clicking through the app in a normal browser
// (`npm run dev:browser`). Injected before src/main.ts by tools/preview/vite.config.ts; never part of a build.
//
// The database is sql.js with the real migrations, kept in localStorage so it survives a reload.
// Open the page with ?reset to start from an empty database.
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { version } from "../../package.json";
import { defaultCommands, sqlCommand } from "./commands.js";

const KEY = "d3-preview-db";
const migrations = import.meta.glob("/src-tauri/migrations/*.sql", { query: "?raw", import: "default", eager: true });

if (new URLSearchParams(location.search).has("reset")) {
  localStorage.removeItem(KEY);
  history.replaceState(null, "", location.pathname);
}

const ready = (async () => {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = localStorage.getItem(KEY);
  if (saved) return new SQL.Database(Uint8Array.from(atob(saved), (c) => c.charCodeAt(0)));
  const db = new SQL.Database();
  for (const name of Object.keys(migrations).sort()) db.exec(migrations[name]);
  return db;
})();

let saveTimer;
function save(db) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const bytes = db.export();
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    try {
      localStorage.setItem(KEY, btoa(s));
    } catch (e) {
      console.warn("[preview] database not saved:", e);
    }
  }, 300);
}

const commands = defaultCommands(version);
const unknown = new Set();
let next = 1;
const callbacks = {};

window.__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
  plugins: { path: { sep: "/", delimiter: ":" } },
  callbacks,
  transformCallback(cb, once) {
    const id = next++;
    callbacks[id] = (data) => {
      if (once) delete callbacks[id];
      return cb && cb(data);
    };
    return id;
  },
  unregisterCallback(id) {
    delete callbacks[id];
  },
  runCallback(id, data) {
    callbacks[id]?.(data);
  },
  convertFileSrc: (p) => p,
  async invoke(cmd, args = {}) {
    const db = await ready;
    const sql = sqlCommand(db, cmd, args);
    if (sql !== undefined) {
      if (cmd === "plugin:sql|execute") save(db);
      return sql;
    }
    if (cmd in commands) return commands[cmd](args) ?? null;
    if (!unknown.has(cmd)) console.info("[preview] not in the browser, answered with null:", cmd, args);
    unknown.add(cmd);
    return null;
  },
};
