import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite ships WASM and must be loaded by Node, not bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default config;
