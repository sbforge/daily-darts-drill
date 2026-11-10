// A fake Autodarts client: the websocket and the bits of the REST API D³ uses, with darts thrown from code.
// For screenshots and demos without a board (tools/screenshot/readme.mjs). No dependencies.
//
//   const board = await startFakeBoard({ port: 3180 });
//   board.throwAt(x, y)      // a dart at board coordinates (1 = outer edge of the double ring, +y up)
//   board.aimAt(x, y, sigma) // the same with a normal scatter of sigma (board units; 0.1 is 17 mm)
//   board.takeout()          // pull the darts: the turn ends
//   await board.close()
import { createHash } from "node:crypto";
import { createServer } from "node:http";

const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
// Radii relative to the outer edge of the double ring, as in src/lib/precision.ts.
const R = { dbl1: 1, dbl0: 0.953, tri1: 0.629, tri0: 0.582, ob: 0.0935, b: 0.0374 };

/** A throw as the Autodarts client reports it. */
export function rawThrow(x, y) {
  const r = Math.hypot(x, y);
  const n = ORDER[((Math.round((Math.atan2(x, y) * 180) / Math.PI / 18) % 20) + 20) % 20];
  const base = { coordsX: x, coordsY: y, bouncer: false, method: "" };
  if (r > R.dbl1) return { ...base, segmentName: "Outside", segmentNumber: n, multiplier: 0, bed: "Outside", name: "Miss" };
  if (r <= R.b) return { ...base, segmentName: "Bull", segmentNumber: 25, multiplier: 2, bed: "Double", name: "Bull" };
  if (r <= R.ob) return { ...base, segmentName: "25", segmentNumber: 25, multiplier: 1, bed: "Single", name: "25" };
  if (r >= R.dbl0) return { ...base, segmentName: String(n), segmentNumber: n, multiplier: 2, bed: "Double", name: `D${n}` };
  if (r >= R.tri0 && r <= R.tri1) return { ...base, segmentName: String(n), segmentNumber: n, multiplier: 3, bed: "Triple", name: `T${n}` };
  const bed = r < R.tri0 ? "SingleInner" : "SingleOuter";
  return { ...base, segmentName: String(n), segmentNumber: n, multiplier: 1, bed, name: `S${n}` };
}

/** A normally distributed number (Box–Muller). `rand` returns [0, 1). */
export function gauss(rand = Math.random) {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

/** Seeded random numbers, so a run can be repeated (mulberry32). */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function frame(text) {
  const data = Buffer.from(text);
  const n = data.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : null;
  if (!head) throw new Error("message too long");
  return Buffer.concat([head, data]);
}

export async function startFakeBoard({ port = 3180, host = "127.0.0.1", rand = Math.random } = {}) {
  const sockets = new Set();
  let running = true;
  let throws = [];
  let status = "throw";

  const state = () => ({ running, status: running ? status : "Stopped", throws, numThrows: throws.length, event: "" });
  const send = (msg) => {
    const f = frame(JSON.stringify(msg));
    for (const s of sockets) s.write(f);
  };
  const broadcast = () => send({ type: "state", data: state() });

  const server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
    const json = (body) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    };
    if (req.method === "OPTIONS") return res.end();
    const path = req.url.split("?")[0];
    if (path === "/api/state") return json(state());
    if (path === "/api/system") return json({ status: { blocker: "none", calibratingCams: 0 } });
    if (path === "/api/start") (running = true), (status = "throw");
    else if (path === "/api/stop") running = false;
    else if (path === "/api/reset") (throws = []), (status = "throw");
    else if (path !== "/api/config/calibration/auto") {
      res.statusCode = 404;
      return res.end();
    }
    res.end();
    broadcast();
  });

  server.on("upgrade", (req, socket) => {
    const key = req.headers["sec-websocket-key"];
    const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    sockets.add(socket);
    socket.on("data", (buf) => {
      if ((buf[0] & 0x0f) === 0x8) socket.end(); // close frame
    });
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => sockets.delete(socket));
    socket.write(frame(JSON.stringify({ type: "state", data: state() })));
  });

  await new Promise((ok) => server.listen(port, host, ok));

  const board = {
    port,
    get throws() {
      return throws;
    },
    throwAt(x, y) {
      if (throws.length >= 3) board.takeout();
      throws = [...throws, rawThrow(x, y)];
      status = throws.length >= 3 ? "takeout" : "throw";
      broadcast();
      return throws.at(-1);
    },
    aimAt(x, y, sigma = 0.08) {
      return board.throwAt(x + gauss(rand) * sigma, y + gauss(rand) * sigma);
    },
    takeout() {
      if (!throws.length) return;
      status = "takeoutInProgress";
      broadcast();
      throws = [];
      status = "throw";
      broadcast();
    },
    close() {
      for (const s of sockets) s.destroy();
      return new Promise((ok) => server.close(ok));
    },
  };
  return board;
}
