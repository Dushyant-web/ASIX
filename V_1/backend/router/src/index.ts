import { serve } from "@hono/node-server";
import { loadConfig } from "./config.ts";
import { createApp } from "./app.ts";

const cfg = loadConfig();
const app = createApp(cfg);

serve({ fetch: app.fetch, port: cfg.PORT }, (info) => {
  console.log(JSON.stringify({ msg: "router up", port: info.port, network: cfg.NETWORK }));
});
