// The app in a normal browser, with the fake Tauri backend from mock.js: `npm run dev:browser`.
import { mergeConfig, type Plugin } from "vite";
import base from "../../vite.config";

const injectMock: Plugin = {
  name: "d3-preview-mock",
  apply: "serve",
  transformIndexHtml: () => [
    { tag: "script", attrs: { type: "module", src: "/tools/preview/mock.js" }, injectTo: "head-prepend" },
  ],
};

export default mergeConfig(base, {
  root: `${__dirname}/../..`,
  plugins: [injectMock],
  server: { host: true, port: 1420, strictPort: false },
});
