// Copies browser worker files from node_modules into public/vendor so they are
// served from the app's own origin with matching versions.
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const out = path.join(process.cwd(), "public", "vendor");
mkdirSync(out, { recursive: true });
copyFileSync(path.join("node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"), path.join(out, "pdf.worker.min.mjs"));
console.log("copied pdf.js worker to public/vendor");
