// Software bill of materials: every third-party package that ends up in the app, as CycloneDX 1.5 JSON.
// Rust: the crates the app is built from on this platform, from `cargo metadata` (no extra tool needed).
// JavaScript: the npm packages bundled into the frontend, collected from the build by the Vite plugin below.
// The build writes it as `sbom.json` next to the frontend; the About page shows it.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function component(ecosystem, name, version, license, url) {
  return {
    type: "library",
    name,
    version,
    purl: `pkg:${ecosystem}/${name.replace("@", "%40")}@${version}`,
    ...(license ? { licenses: [{ expression: license }] } : {}),
    ...(url ? { externalReferences: [{ type: "vcs", url }] } : {}),
  };
}

/** The crates the app links on this machine's platform, build scripts and macros included, dev-only crates left out. */
export function rustComponents(cargoDir) {
  const host = execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(/^host: (.+)$/m)[1];
  const meta = JSON.parse(
    execFileSync("cargo", ["metadata", "--format-version", "1", "--locked", "--filter-platform", host], {
      cwd: cargoDir,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
  const used = new Set();
  const todo = [meta.resolve.root];
  while (todo.length) {
    const id = todo.pop();
    if (used.has(id)) continue;
    used.add(id);
    for (const d of nodes.get(id).deps) if (d.dep_kinds.some((k) => k.kind !== "dev")) todo.push(d.pkg);
  }
  used.delete(meta.resolve.root);
  return meta.packages
    .filter((p) => used.has(p.id))
    .map((p) => component("cargo", p.name, p.version, p.license, p.repository ?? p.homepage));
}

/** The npm packages behind the given module paths (from the bundle), each once. */
export function npmComponents(moduleIds) {
  const dirs = new Set();
  for (const id of moduleIds) {
    const file = id.replace(/\\/g, "/").replace(/^\0/, "");
    const i = file.lastIndexOf("/node_modules/");
    if (i < 0) continue;
    const parts = file.slice(i + "/node_modules/".length).split("/");
    const name = parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
    dirs.add(`${file.slice(0, i)}/node_modules/${name}`);
  }
  return [...dirs].map((dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const repo = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
    return component("npm", pkg.name, pkg.version, pkg.license, repo ?? pkg.homepage);
  });
}

/** In `vite dev` there is no bundle: the runtime dependencies from the lock file stand in. */
export function lockComponents(root) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  return Object.entries(lock.packages)
    .filter(([key, p]) => key.startsWith("node_modules/") && !p.dev)
    .map(([key, p]) => component("npm", key.slice(key.lastIndexOf("node_modules/") + 13), p.version, p.license));
}

export function bom(app, components) {
  const byName = (a, b) => a.purl.localeCompare(b.purl);
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: { type: "application", name: app.name, version: app.version, licenses: [{ expression: app.license }] },
    },
    components: components.sort(byName),
  };
}

/** Vite plugin: writes sbom.json into the build, and serves one from the lock file in dev. */
export function sbom({ app, root, cargoDir }) {
  let rust = [];
  const safeRust = (warn) => {
    try {
      return rustComponents(cargoDir);
    } catch (e) {
      warn(`SBOM: no Rust crates, cargo metadata failed: ${e.message}`);
      return [];
    }
  };
  return {
    name: "sbom",
    buildStart() {
      if (!this.meta.watchMode) rust = safeRust((m) => this.warn(m));
    },
    generateBundle(_, bundle) {
      const ids = Object.values(bundle).flatMap((c) => (c.type === "chunk" ? c.moduleIds : []));
      const json = bom(app, [...rust, ...npmComponents(ids)]);
      this.emitFile({ type: "asset", fileName: "sbom.json", source: JSON.stringify(json, null, 2) });
    },
    configureServer(server) {
      let cached;
      server.middlewares.use("/sbom.json", (_, res) => {
        cached ??= JSON.stringify(bom(app, [...safeRust(console.warn), ...lockComponents(root)]));
        res.setHeader("content-type", "application/json");
        res.end(cached);
      });
    },
  };
}
