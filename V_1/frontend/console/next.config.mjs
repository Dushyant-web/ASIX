import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/* There are stray lockfiles at the git root (/AXIS) with no package.json
   beside them, so Next infers THAT as the workspace root instead of V_1 —
   which puts file tracing on the wrong tree and warns on every boot. Pin it
   to V_1, where pnpm-workspace.yaml actually lives. */
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** @type {import('next').NextConfig} */
export default {
  // @axis/shared is TypeScript source, consumed directly from the workspace.
  transpilePackages: ["@axis/shared"],
  outputFileTracingRoot: workspaceRoot,
};
