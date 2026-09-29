/**
 * Builds the architecture document package locally (no paid services):
 *   Mermaid (.mmd) -> SVG, rendered with the mermaid npm package in Playwright's Chromium
 *   Markdown (.md) -> HTML (marked) with diagrams inlined -> PDF (Chromium print)
 *   Selected diagrams -> high-resolution PNG
 *
 * Usage: npx tsx scripts/docs/build-docs.mts
 *
 * In Markdown, a diagram is embedded with an image reference to its .mmd file:
 *   ![Caption](architecture/system-architecture.mmd)
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { marked } from "marked";

const ROOT = process.cwd();
const DOCS = path.join(ROOT, "docs");
const DIAGRAMS = path.join(DOCS, "architecture");
const MERMAID_JS = path.join(ROOT, "node_modules", "mermaid", "dist", "mermaid.min.js");

const MERMAID_CONFIG = {
  startOnLoad: false,
  theme: "base",
  securityLevel: "strict",
  htmlLabels: true,
  fontFamily: "Arial, Helvetica, sans-serif",
  themeVariables: {
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: "16px",
    primaryColor: "#ffffff",
    primaryBorderColor: "#374151",
    primaryTextColor: "#111827",
    lineColor: "#374151",
    clusterBkg: "#fafafa",
    clusterBorder: "#9ca3af",
    edgeLabelBackground: "#ffffff",
    tertiaryColor: "#ffffff",
  },
  flowchart: { curve: "basis", padding: 10, nodeSpacing: 28, rankSpacing: 42, useMaxWidth: false, wrappingWidth: 280 },
  sequence: { useMaxWidth: false, mirrorActors: false, actorMargin: 30, messageMargin: 28, width: 130, wrap: true },
  er: { useMaxWidth: false },
  state: { useMaxWidth: false },
};

async function renderMermaid(browser: Browser, files: string[]): Promise<Map<string, string>> {
  const page = await browser.newPage();
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({ path: MERMAID_JS });
  await page.evaluate((cfg) => (window as unknown as { mermaid: { initialize: (c: unknown) => void } }).mermaid.initialize(cfg), MERMAID_CONFIG);
  const out = new Map<string, string>();
  for (const f of files) {
    const src = readFileSync(path.join(DIAGRAMS, f), "utf8");
    const id = `d${out.size}`;
    const svg = await page.evaluate(
      async ([code, id]) => {
        const m = (window as unknown as { mermaid: { render: (id: string, code: string) => Promise<{ svg: string }> } }).mermaid;
        return (await m.render(id, code)).svg;
      },
      [src, id] as const,
    );
    writeFileSync(path.join(DIAGRAMS, f.replace(/\.mmd$/, ".svg")), svg);
    out.set(f, svg);
    console.log(`rendered ${f}`);
  }
  await page.close();
  return out;
}

const CSS = `
@page { size: A4; margin: 16mm 15mm 18mm 15mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 10.2pt; line-height: 1.45; margin: 0; }
h1 { font-size: 19pt; margin: 0 0 6pt; color: #111827; letter-spacing: -0.2pt; }
h2 { font-size: 13.5pt; margin: 14pt 0 5pt; color: #1f4e8c; border-bottom: 1.2pt solid #1f4e8c; padding-bottom: 2pt; }
h3 { font-size: 11pt; margin: 10pt 0 4pt; color: #111827; }
h1, h2, h3, h4 { break-after: avoid; page-break-after: avoid; }
h2 + p, h2 + figure, h2 + table { break-before: avoid; }
p { margin: 0 0 6pt; }
ul, ol { margin: 0 0 6pt; padding-left: 16pt; }
li { margin: 1pt 0; }
code { font-family: Menlo, Consolas, monospace; font-size: 8.6pt; background: #f3f4f6; padding: 0 2pt; border-radius: 2pt; }
pre { background: #f3f4f6; padding: 6pt 8pt; border-radius: 3pt; font-size: 8.4pt; line-height: 1.35; white-space: pre-wrap; margin: 0 0 6pt; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 4pt 0 8pt; font-size: 8.8pt; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th { background: #eef2f7; text-align: left; font-weight: bold; }
th, td { border: 0.6pt solid #cbd5e1; padding: 3pt 5pt; vertical-align: top; }
blockquote { margin: 6pt 0; padding: 5pt 9pt; border-left: 3pt solid #1f4e8c; background: #f5f8fd; }
blockquote p { margin: 0; }
.page-break { break-after: page; height: 0; }
figure { margin: 6pt 0 8pt; text-align: center; break-inside: avoid; }
figure svg { max-width: 100%; height: auto; }
figure.tall svg { max-height: 222mm; width: auto; }
figure.mid svg { max-height: 150mm; width: auto; }
figure.short svg { max-height: 95mm; width: auto; }
figcaption { font-size: 8.4pt; color: #4b5563; margin-top: 3pt; }
.legend { font-size: 7.6pt; color: #374151; margin-top: 4pt; display: flex; flex-wrap: wrap; justify-content: center; gap: 3pt 10pt; }
.legend b { margin-right: 2pt; }
.lg { display: inline-flex; align-items: center; gap: 3pt; }
.sw { display: inline-block; width: 12pt; height: 7pt; border-radius: 1.5pt; }
.sw-impl { background: #e6f4ea; border: 1pt solid #1f7a45; }
.sw-opt { background: #fff4d6; border: 1pt solid #b7791f; }
.sw-future { background: #f3f4f6; border: 1pt dashed #6b7280; }
.sw-human { background: #e3ebfa; border: 1.2pt solid #1f4e8c; }
.sw-pending { background: #fdecec; border: 1pt dashed #b42318; }
.sw-neutral { background: #ffffff; border: 1pt solid #6b7280; }
.cards table { font-size: 6.7pt; line-height: 1.22; }
.cards th, .cards td { padding: 1.2pt 2.6pt; }
.cols2 ul { columns: 2; column-gap: 14pt; }
td code, th code { font-size: 0.88em; padding: 0 1pt; }
.cards table { table-layout: fixed; }
.cards th:nth-child(1) { width: 12%; } .cards th:nth-child(2) { width: 9%; } .cards th:nth-child(3) { width: 13%; }
.cards th:nth-child(4) { width: 15%; } .cards th:nth-child(5) { width: 15%; } .cards th:nth-child(6) { width: 10%; }
.cards th:nth-child(7) { width: 12%; } .cards th:nth-child(8) { width: 14%; }
.cards .status { font-size: 6.2pt; padding: 0 2pt; }
${[60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 200, 215, 225].map((h) => `figure.h${h} svg { max-height: ${h}mm; width: auto; max-width: 100%; }`).join("\n")}
.flow2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; margin: 6pt 0 8pt; }
.flow2 .col { border: 0.8pt solid #cbd5e1; border-radius: 3pt; padding: 6pt 8pt; }
.flow2 h4 { margin: 0 0 4pt; font-size: 9.4pt; }
.flow2 .st { border: 0.9pt solid #6b7280; border-radius: 2.5pt; padding: 1.6pt 6pt; margin: 0 auto; width: 88%; text-align: center; font-size: 8.4pt; background: #fff; }
.flow2 .st.impl { background: #e6f4ea; border-color: #1f7a45; color: #0f2e1c; }
.flow2 .st.human { background: #e3ebfa; border-color: #1f4e8c; color: #0f2649; }
.flow2 .st.pending { background: #fdecec; border: 0.9pt dashed #b42318; color: #7a1a12; }
.flow2 .ar { text-align: center; font-size: 8pt; line-height: 1; color: #374151; margin: 1pt 0; }
.status { display: inline-block; font-size: 7.6pt; font-weight: bold; padding: 0.5pt 4pt; border-radius: 2pt; letter-spacing: 0.3pt; }
.impl { background: #dcf1e3; color: #14532d; border: 0.6pt solid #1f7a45; }
.opt { background: #fdf0cc; color: #713f12; border: 0.6pt solid #b7791f; }
.future { background: #eef0f3; color: #374151; border: 0.6pt dashed #6b7280; }
.human { background: #e3ebfa; color: #1e3a6e; border: 0.6pt solid #1f4e8c; }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: space-between; }
.cover .band { border-top: 6pt solid #1f4e8c; padding-top: 34mm; }
.cover .title { font-size: 30pt; font-weight: bold; letter-spacing: -0.5pt; margin: 0; color: #111827; }
.cover .subtitle { font-size: 14.5pt; color: #1f4e8c; margin: 6pt 0 22pt; }
.cover table { width: auto; font-size: 10pt; }
.cover td { border: none; padding: 2pt 14pt 2pt 0; }
.cover td:first-child { color: #6b7280; }
.cover .note { font-size: 8.8pt; color: #4b5563; border-top: 0.6pt solid #cbd5e1; padding-top: 6pt; }
.card { border: 0.8pt solid #cbd5e1; border-radius: 3pt; padding: 5pt 7pt; margin: 0 0 6pt; break-inside: avoid; }
.card h3 { margin: 0 0 3pt; font-size: 10.2pt; }
.card table { margin: 0; font-size: 8.4pt; }
.card thead { display: none; }
.card td:first-child { width: 22%; color: #374151; font-weight: bold; background: #f8fafc; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6pt; }
.small { font-size: 8.6pt; color: #4b5563; }
.onepage h1 { font-size: 17pt; margin-bottom: 2pt; }
.onepage figure svg { max-height: 200mm; width: auto; }
.onepage { font-size: 8.9pt; line-height: 1.35; }
.onepage ul { margin: 0 0 3pt; }
.onepage li { margin: 0; }
.onepage p { margin: 0 0 4pt; }
.onepage figure { margin: 3pt 0 4pt; }
`;

export const LEGEND_ITEMS: Record<string, [string, string]> = {
  impl: ["impl", "Implemented (verified in code and tests)"],
  opt: ["opt", "Optional — implemented, off by default"],
  future: ["future", "Proposed / future — not built"],
  human: ["human", "Human control point"],
  pending: ["pending", "Issue / not yet provisioned"],
  neutral: ["neutral", "External / input"],
};

function legendHtml(keys: string[]): string {
  if (!keys.length) return "";
  return `<div class="legend"><b>Legend</b>${keys.map((k) => `<span class="lg"><span class="sw sw-${LEGEND_ITEMS[k][0]}"></span>${LEGEND_ITEMS[k][1]}</span>`).join("")}<span class="lg">→ arrows show data / control direction; dotted = optional or proposed</span></div>`;
}

function markdownToHtml(md: string, diagrams: Map<string, string>): string {
  // ![Caption](architecture/x.mmd){class}  -> figure with inline SVG
  const withFigures = md.replace(/!\[([^\]]*)\]\(architecture\/([\w-]+\.mmd)\)(?:\{([^}]*)\})?/g, (_m, cap: string, file: string, opts?: string) => {
    const svg = diagrams.get(file);
    if (!svg) throw new Error(`diagram not found: ${file}`);
    const tokens = (opts ?? "").split(/\s+/).filter(Boolean);
    const cls = tokens.find((t) => !t.includes("=")) ?? "mid";
    const legend = tokens.find((t) => t.startsWith("legend="))?.slice(7).split(",") ?? [];
    return `\n<figure class="${cls}">${svg}${legendHtml(legend)}<figcaption>${cap}</figcaption></figure>\n`;
  });
  return marked.parse(withFigures, { async: false, gfm: true }) as string;
}

async function toPdf(browser: Browser, html: string, out: string, title: string, footer = true) {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head><body>${html}</body></html>`, { waitUntil: "load" });
  await page.pdf({
    path: out,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: footer,
    headerTemplate: "<div></div>",
    footerTemplate: `<div style="font-family: Arial; font-size: 7.5pt; color: #6b7280; width: 100%; padding: 0 15mm; display: flex; justify-content: space-between;"><span>${title}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  });
  await page.close();
  console.log(`wrote ${path.relative(ROOT, out)}`);
}

async function toPng(browser: Browser, svg: string, out: string, title: string, legend: string[]) {
  const page = await browser.newPage({ deviceScaleFactor: 3, viewport: { width: 1800, height: 1200 } });
  await page.setContent(
    `<!doctype html><html><head><style>${CSS} body{margin:0;background:#fff;font-family:Arial} .wrap{display:inline-block;padding:28px 36px;background:#fff} h1{font-size:22px;margin:0 0 14px;color:#111827} .legend{font-size:13px;gap:6px 18px} .sw{width:22px;height:12px}</style></head><body><div class="wrap"><h1>${title}</h1>${svg}${legendHtml(legend)}</div></body></html>`,
  );
  await page.locator(".wrap").screenshot({ path: out });
  await page.close();
  console.log(`wrote ${path.relative(ROOT, out)}`);
}

const DOCUMENTS: { md: string; pdf: string; title: string; footer?: boolean }[] = [
  { md: "College_Operations_Copilot_Architecture.md", pdf: "College_Operations_Copilot_Architecture.pdf", title: "College Operations Copilot — Architecture" },
  { md: "College_Operations_Copilot_Agent_Handbook.md", pdf: "College_Operations_Copilot_Agent_Handbook.pdf", title: "College Operations Copilot — Agent Handbook" },
  { md: "College_Operations_Copilot_System_Design.md", pdf: "College_Operations_Copilot_System_Design.pdf", title: "College Operations Copilot — System Design" },
  { md: "College_Operations_Copilot_Architecture_OnePage.md", pdf: "College_Operations_Copilot_Architecture_OnePage.pdf", title: "College Operations Copilot — Architecture on a page", footer: false },
];

async function main() {
  const only = process.argv[2];
  mkdirSync(DIAGRAMS, { recursive: true });
  const browser = await chromium.launch();
  try {
    const files = readdirSync(DIAGRAMS).filter((f) => f.endsWith(".mmd")).sort();
    const diagrams = await renderMermaid(browser, files);
    if (only === "--diagrams") return;
    for (const d of DOCUMENTS) {
      const mdPath = path.join(DOCS, d.md);
      const html = markdownToHtml(readFileSync(mdPath, "utf8"), diagrams);
      await toPdf(browser, html, path.join(DOCS, d.pdf), d.title, d.footer !== false);
    }
    await toPng(browser, diagrams.get("system-architecture.mmd")!, path.join(DIAGRAMS, "college-operations-copilot-architecture.png"), "College Operations Copilot — System Architecture (current implementation)", ["impl", "opt", "human"]);
    await toPng(browser, diagrams.get("agent-map.mmd")!, path.join(DIAGRAMS, "college-operations-copilot-agent-map.png"), "College Operations Copilot — Agent Map (proposed agents and their current software counterparts)", ["future", "human"]);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
