// Merge the vinext prerender output into a single static directory for hosts
// like Vercel that expect one output folder:
//   dist/client (assets, absolute /_next/... paths) +
//   dist/server/prerendered-routes (index.html, 404.html)
// → dist/static
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist", "static");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "dist", "client"), out, { recursive: true });
cpSync(join(root, "dist", "server", "prerendered-routes"), out, { recursive: true });
console.log(`Static site collected in ${out}`);
