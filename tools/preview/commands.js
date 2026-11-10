// What the fake Tauri backend answers for the app's own commands (anything not listed resolves to null).
// Shared by the browser preview (tools/preview) and the screenshot tool (tools/screenshot).
export function defaultCommands(version) {
  return {
    startup_report: () => ({}),
    list_backups: () => [],
    discover_boards: () => [],
    log_tail: () => [],
    "plugin:app|version": () => version,
    "plugin:app|name": () => "D³",
    "plugin:app|tauri_version": () => "2",
    "plugin:log|log": () => null,
    "plugin:event|listen": () => 1,
    "plugin:event|unlisten": () => null,
    "plugin:window|is_fullscreen": () => typeof document !== "undefined" && document.fullscreenElement != null,
    "plugin:window|set_fullscreen": ({ value } = {}) =>
      typeof document === "undefined" ? null : value ? document.documentElement.requestFullscreen?.() : document.exitFullscreen?.(),
  };
}

// plugin-sql uses $1, $2 …; bound by name, so their order in the query doesn't matter.
const params = (values) =>
  Object.fromEntries((values ?? []).map((v, i) => [`$${i + 1}`, typeof v === "boolean" ? Number(v) : v]));

/** The SQL plugin on a sql.js database; undefined for any other command. */
export function sqlCommand(db, cmd, args) {
  if (cmd === "plugin:sql|load") return args.db;
  if (cmd === "plugin:sql|close") return true;
  if (cmd === "plugin:sql|execute") {
    db.run(args.query, params(args.values));
    return [db.getRowsModified(), db.exec("SELECT last_insert_rowid()")[0].values[0][0]];
  }
  if (cmd === "plugin:sql|select") {
    const st = db.prepare(args.query);
    st.bind(params(args.values));
    const rows = [];
    while (st.step()) rows.push(st.getAsObject());
    st.free();
    return rows;
  }
}
