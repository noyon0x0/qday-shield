import react from "@vitejs/plugin-react";
import { build } from "vite";

// Mirrors the production-relevant settings from vite.config.ts while avoiding
// esbuild's config-loader filesystem scan in restricted workspace environments.
await build({ configFile: false, plugins: [react()] });
