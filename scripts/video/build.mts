/**
 * Builds the product video from the narration (scripts/video/script.ts), the
 * live production recording (.cache/video/raw, from record-product.mts) and
 * HTML/CSS scenes (scripts/video/compositor.html), rendered frame by frame.
 *
 *   npx tsx scripts/video/build.mts [--raw=.cache/video/raw] [--only=main|short|stills]
 *
 * Outputs (git-ignored): demo/College_Operations_Copilot_Product_Video.mp4 (+ .srt),
 * demo/College_Operations_Copilot_Short.mp4, demo/College_Operations_Copilot_Architecture.mp4.
 * Committed: docs/video/STORYBOARD.pdf, docs/video/current-system.png, docs/video/future-agents.png.
 *
 * Footage is never invented: every demo frame is a frame of the recording.
 * Footage may be sped up to fit the narration; when it is, the frame says so.
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Page } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Icons from "lucide-react";
import { SCENES, SHORT, type Line } from "./script";

const ROOT = process.cwd();
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const RAW = path.resolve(arg("raw") ?? ".cache/video/raw");
const ONLY = arg("only");
const WORK = path.join(ROOT, ".cache", "video", "build");
const AUDIO = path.join(ROOT, ".cache", "video", "tts");
const ASSETS = path.join(ROOT, ".cache", "video", "assets");
const OUT = path.join(ROOT, "demo");
const DOCS = path.join(ROOT, "docs", "video");
const FPS = 30;
const SR = 48000;
const VOICE = process.env.VIDEO_VOICE ?? "Aman";
const RATE = process.env.VIDEO_RATE ?? "190";
const PROD = "https://college-operations-copilot.vercel.app";
for (const d of [WORK, AUDIO, ASSETS, OUT, DOCS]) mkdirSync(d, { recursive: true });

/* ------------------------------------------------------------ recording */
type Box = { x: number; y: number; w: number; h: number };
const frames: { file: string; t: number }[] = JSON.parse(readFileSync(path.join(RAW, "frames.json"), "utf8"));
const markers: { name: string; t: number; boxes: Record<string, Box> }[] = JSON.parse(readFileSync(path.join(RAW, "markers.json"), "utf8"));
const meta: { base?: string } = existsSync(path.join(RAW, "meta.json")) ? JSON.parse(readFileSync(path.join(RAW, "meta.json"), "utf8")) : {};
const IS_PROD = meta.base === PROD;
if (!IS_PROD) console.warn(`NOTE: footage is not from ${PROD} (${meta.base ?? "unknown"}); frames are watermarked REHEARSAL.`);
const T0 = frames[0].t;
const mk = (name: string) => {
  const m = markers.find((x) => x.name === name);
  if (!m) throw new Error(`marker ${name} missing`);
  return m;
};
const at = ([name, off]: [string, number]) => mk(name).t - T0 + off;
function frameAt(tRel: number): string {
  const t = tRel + T0;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return pathToFileURL(path.join(RAW, "frames", frames[lo].file)).href;
}

/* ------------------------------------------------------------ narration */
function speakable(l: Line) {
  return (l.say ?? l.text).replace(/—/g, ", ").replace(/\s+/g, " ").trim();
}
function synth(l: Line): { file: string; dur: number } {
  const text = speakable(l);
  const key = createHash("sha1").update(`${VOICE}|${RATE}|${text}`).digest("hex").slice(0, 16);
  const wav = path.join(AUDIO, `${key}.wav`);
  const probe = (f: string) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }));
  if (!existsSync(wav)) {
    // The macOS voice occasionally renders a line far slower than asked; take
    // three renders and keep the median-length one so the pace stays even.
    const takes: { f: string; d: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const aiff = path.join(AUDIO, `${key}-${i}.aiff`), out = path.join(AUDIO, `${key}-${i}.wav`);
      execFileSync("say", ["-v", VOICE, "-r", RATE, "-o", aiff, text]);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", aiff, "-af", "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse", "-ar", String(SR), "-ac", "1", "-c:a", "pcm_s16le", out]);
      takes.push({ f: out, d: probe(out) });
    }
    takes.sort((x, y) => x.d - y.d);
    execFileSync("cp", [takes[1].f, wav]);
  }
  return { file: wav, dur: probe(wav) };
}

/* ---------------------------------------------------------------- shots */
/** at/until: fraction of the shot. ftUntil: hide once the recording passes this moment (the layout changes there). */
type Callout = { marker: string; box: string; label?: string; tone?: "danger" | "success" | "warning"; at?: number; until?: number; ftUntil?: [string, number]; ftFrom?: [string, number]; outline?: boolean };
type Shot = { from: [string, number]; to: [string, number]; zoom?: { marker: string; box: string; minW?: number }; callouts?: Callout[]; lower?: "attendance" };
const SHOTS: Record<string, Shot[][]> = {
  "s05a-demo": [
    [{ from: ["login", 0], to: ["login-submitted", 0.6] }],
    [{ from: ["dashboard", -0.4], to: ["create", -1.3], callouts: [{ marker: "dashboard", box: "kpis", label: "Counts from the database", at: 0.12 }, { marker: "dashboard", box: "env", label: "Deployed app", at: 0.5 }] }],
    [{ from: ["create", -1.3], to: ["upload", 0], callouts: [{ marker: "create", box: "stepper", label: "Seven steps, from details to approval", at: 0.3 }] }, { from: ["upload", 0], to: ["upload-ocr", 0] }],
    [{ from: ["upload-ocr", 0], to: ["upload-done", 0] }, { from: ["upload-done", 0], to: ["upload-done", 2.4], callouts: [{ marker: "upload-done", box: "jobs", label: "Each real processing stage, per file", at: 0.05 }] }],
    [
      { from: ["review", 0], to: ["preview", -2.6], zoom: { marker: "review", box: "field", minW: 1500 }, callouts: [{ marker: "review", box: "source", label: "Evidence source · file and page", at: 0.25 }] },
      { from: ["preview", -1.2], to: ["preview", 3.2], callouts: [{ marker: "preview", box: "panel", label: "Source page beside the extracted text", at: 0.2, outline: false }] },
    ],
  ],
  "s06-conflict": [
    [{ from: ["conflict", 0], to: ["conflict", 2.0], zoom: { marker: "conflict", box: "card", minW: 1400 }, callouts: [{ marker: "conflict", box: "banner", label: "Conflict detected", tone: "danger", at: 0.35 }] }],
    [{ from: ["conflict", 2.0], to: ["choose", -1.6], zoom: { marker: "conflict", box: "card", minW: 1400 }, callouts: [{ marker: "conflict", box: "poster", label: "Source: Poster · 31/10/2026", tone: "danger", at: 0.05 }, { marker: "conflict", box: "notice", label: "Source: Notice · 06/11/2026", at: 0.4 }] }],
    [{ from: ["choose", -1.6], to: ["choose", 0], zoom: { marker: "conflict", box: "card", minW: 1400 }, callouts: [{ marker: "conflict", box: "banner", label: "Human review required", tone: "warning", at: 0.1 }, { marker: "conflict", box: "poster", tone: "danger", at: 0 }, { marker: "conflict", box: "notice", at: 0 }] }],
    [{ from: ["choose", -0.2], to: ["chosen", 2.4], zoom: { marker: "conflict", box: "card", minW: 1400 }, callouts: [{ marker: "choose", box: "button", label: "A person decides", ftUntil: ["choose", 0.9] }, { marker: "chosen", box: "card", label: "Decision recorded in the audit log", tone: "success", ftFrom: ["chosen", 0] }] }],
  ],
  "s07-attendance": [
    [{ from: ["attendance-rows", 0], to: ["attendance-rows", 2.4], callouts: [{ marker: "attendance-rows", box: "status", label: "OCR draft · needs verification", tone: "warning", at: 0.15 }] }],
    [{ from: ["attendance", 0], to: ["attendance", 2.9], zoom: { marker: "attendance", box: "recon", minW: 1500 }, callouts: [{ marker: "attendance", box: "recon", label: "Stated 8 · rows read 7 · counts differ", tone: "danger", at: 0.2 }] }],
    [
      { from: ["attendance-rows", 2.4], to: ["verify-confirm", 0] },
      { from: ["verify-confirm", 0], to: ["reconciled", 2.8], lower: "attendance", callouts: [{ marker: "verify-confirm", box: "dialog", label: "A person confirms", ftUntil: ["verify-confirm", 1.9] }, { marker: "reconciled", box: "badge", label: "Reconciled", tone: "success", ftFrom: ["reconciled", 0] }] },
    ],
  ],
  "s05b-demo": [
    [{ from: ["reports", 0], to: ["generated", 1.0] }, { from: ["paper", 0], to: ["paper", 3.4], callouts: [{ marker: "paper", box: "paper", label: "Built only from reviewed fields · synthetic example", at: 0.15 }] }],
    [{ from: ["approve", 0], to: ["approved", 2.4], callouts: [{ marker: "approve", box: "checklist", label: "Every check must pass", tone: "success", at: 0.05, ftUntil: ["approve", 1.5] }, { marker: "approve", box: "button", label: "Approval is a human action", ftFrom: ["approve", 1.5], ftUntil: ["approve-click", 0.1] }, { marker: "approved", box: "header", label: "Approver and time recorded", tone: "success", ftFrom: ["approved", 0] }] }],
    [{ from: ["exports", 0], to: ["audit", 0], callouts: [{ marker: "exports", box: "cards", label: "Word · PDF · packet · evidence ZIP", at: 0.1 }] }, { from: ["audit", 0], to: ["audit", 3.6], callouts: [{ marker: "audit", box: "timeline", label: "Every step in the audit trail", at: 0.1, outline: false }] }],
  ],
  "s11-feedback": [
    [{ from: ["feedback", 0], to: ["feedback", 1.4], callouts: [{ marker: "feedback", box: "card", label: "Asked after approval", at: 0.15 }] }],
    [{ from: ["feedback", 1.4], to: ["feedback-saved", 2.2], callouts: [{ marker: "feedback-filled", box: "card", label: "Rating · comments · corrections · effort · use again", ftFrom: ["feedback-filled", -2.5], ftUntil: ["feedback-filled", 0.4] }] }],
    [], // the administrator's Pilot page still (graphic)
  ],
};

/* ------------------------------------------------------------- timeline */
type View = Box;
const FULL: View = { x: 0, y: 0, w: 1920, h: 1080 };
type Seg =
  | { kind: "graphic"; scene: string; start: number; dur: number; cues: number[] }
  | { kind: "footage"; start: number; dur: number; shot: Shot; f0: number; f1: number };
type Placed = { file: string; start: number; dur: number; text: string };

function zoomView(z: Shot["zoom"]): View {
  if (!z) return FULL;
  const b = mk(z.marker).boxes[z.box];
  if (!b) return FULL;
  const pad = 70;
  let w = Math.max(z.minW ?? 1200, b.w + 2 * pad, ((b.h + 2 * pad) * 16) / 9);
  w = Math.min(w, 1920);
  const h = (w * 9) / 16;
  const x = Math.min(Math.max(b.x + b.w / 2 - w / 2, 0), 1920 - w);
  const y = Math.min(Math.max(b.y + b.h / 2 - h / 2, 0), 1080 - h);
  return { x, y, w, h };
}

function buildTimeline(variant: "main" | "short") {
  const segs: Seg[] = [];
  const voice: Placed[] = [];
  const scenesAt: { id: string; title: string; status: string; start: number; dur: number }[] = [];
  let cursor = 0;
  const list = variant === "main" ? SCENES.map((s) => ({ scene: s, lines: s.lines })) : SHORT.map((x) => ({ scene: SCENES.find((s) => s.id === x.scene)!, lines: x.lines }));
  for (const [si, { scene, lines }] of list.entries()) {
    const isDemo = !!SHOTS[scene.id];
    const lead = variant === "short" ? 0.25 : isDemo ? 0.3 : 0.45;
    const tail = variant === "short" ? 0.25 : 0.35;
    const start = cursor;
    let t = start + lead;
    const lineTimes: { start: number; dur: number }[] = [];
    for (const l of lines) {
      const s = synth(l);
      voice.push({ file: s.file, start: t, dur: s.dur, text: l.text });
      lineTimes.push({ start: t, dur: s.dur + (l.pause ?? 0.25) });
      t += s.dur + (l.pause ?? 0.25);
    }
    const end = t + tail;
    if (!isDemo) {
      const n = scene.lines.length;
      const cues = variant === "main" ? lineTimes.map((x) => x.start - start) : Array.from({ length: n }, (_, i) => 0.15 + (i * (end - start) * 0.72) / n);
      segs.push({ kind: "graphic", scene: scene.id, start, dur: end - start, cues });
    } else {
      // Short version: one representative shot per demo scene.
      const plan: { shots: Shot[]; s: number; e: number }[] =
        variant === "main"
          ? lineTimes.map((lt, i) => ({ shots: SHOTS[scene.id][i], s: i === 0 ? start : lt.start, e: i === lineTimes.length - 1 ? end : lineTimes[i + 1].start }))
          : [{ shots: SHORT_SHOTS[scene.id], s: start, e: end }];
      for (const p of plan) {
        if (!p.shots.length) {
          segs.push({ kind: "graphic", scene: "metrics", start: p.s, dur: p.e - p.s, cues: [0] });
          continue;
        }
        const lens = p.shots.map((sh) => Math.max(0.2, at(sh.to) - at(sh.from)));
        const weights = lens.map((l) => Math.min(Math.max(l, 1.6), 10));
        const W = weights.reduce((a, b) => a + b, 0);
        let s = p.s;
        p.shots.forEach((sh, k) => {
          const d = ((p.e - p.s) * weights[k]) / W;
          segs.push({ kind: "footage", start: s, dur: d, shot: sh, f0: at(sh.from), f1: at(sh.to) });
          s += d;
        });
      }
    }
    scenesAt.push({ id: scene.id, title: scene.title, status: scene.status, start, dur: end - start });
    cursor = end;
    void si;
  }
  return { segs, voice, scenes: scenesAt, total: cursor };
}

const SHORT_SHOTS: Record<string, Shot[]> = {
  "s05a-demo": [SHOTS["s05a-demo"][4][0]],
  "s06-conflict": [{ ...SHOTS["s06-conflict"][1][0], callouts: [{ marker: "conflict", box: "banner", label: "Conflict detected", tone: "danger", at: 0.05 }, { marker: "conflict", box: "poster", label: "Poster · 31/10/2026", tone: "danger", at: 0.2 }, { marker: "conflict", box: "notice", label: "Notice · 06/11/2026", at: 0.45 }] }],
  "s07-attendance": [SHOTS["s07-attendance"][0][0]],
  "s05b-demo": [SHOTS["s05b-demo"][1][0]],
};

/* ---------------------------------------------------------- frame state */
const ICONS: Record<string, string> = {};
for (const n of ["UserCheck", "FileStack", "Layers", "GitCompareArrows", "PenLine", "Copy", "UploadCloud", "ScanText", "Link2", "ListChecks", "FileText", "ShieldCheck", "Download", "CircleSlash", "Network", "FolderSearch", "BellRing", "RefreshCw"]) {
  const C = (Icons as unknown as Record<string, Icons.LucideIcon>)[n];
  if (!C) throw new Error(`icon ${n} missing`);
  ICONS[n] = renderToStaticMarkup(createElement(C, { size: 24, strokeWidth: 1.8 }));
}
const fileUrl = (p: string) => pathToFileURL(p).href;
function assets() {
  const dash = markers.find((m) => m.name === "dashboard");
  const metricsPng = path.join(RAW, "pilot-metrics.png");
  const mw = existsSync(metricsPng) ? Number(execFileSync("sips", ["-g", "pixelWidth", metricsPng], { encoding: "utf8" }).match(/pixelWidth: (\d+)/)?.[1] ?? 1600) : 1600;
  return {
    poster: fileUrl(path.join(ROOT, "demo/input/demo-poster.png")),
    notice: fileUrl(path.join(ASSETS, "notice-1.png")),
    attendance: fileUrl(path.join(ROOT, "demo/input/demo-attendance-sheet.png")),
    photo: fileUrl(path.join(ROOT, "demo/input/demo-event-photo.jpg")),
    report: fileUrl(path.join(ASSETS, "report-1.png")),
    dashboard: dash ? frameAt(dash.t - T0 + 1.0) : "",
    metrics: fileUrl(metricsPng),
    metricsW: mw,
  };
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lerpView = (a: View, b: View, p: number): View => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, w: a.w + (b.w - a.w) * p, h: a.h + (b.h - a.h) * p });

function lowerAttendance(alpha: number) {
  const step = (t: string, bg: string, fg: string) => `<span class="step" style="background:${bg};color:${fg}">${t}</span>`;
  const arrow = `<span class="arrow">→</span>`;
  return `<div class="lower" style="opacity:${alpha}">${step("Extracted by OCR", "rgba(251,191,36,.16)", "#fde68a")}${arrow}${step("Needs review", "rgba(251,191,36,.16)", "#fde68a")}${arrow}${step("Human verification", "rgba(99,102,241,.22)", "#c7d2fe")}${arrow}${step("Verified", "rgba(52,211,153,.18)", "#a7f3d0")}</div>`;
}

function stateAt(tl: ReturnType<typeof buildTimeline>, t: number, variant: "main" | "short", A: ReturnType<typeof assets>) {
  const segIdx = tl.segs.findIndex((s) => t >= s.start && t < s.start + s.dur);
  const seg = tl.segs[segIdx === -1 ? tl.segs.length - 1 : segIdx];
  const local = t - seg.start;
  const caption = variant === "short" ? (tl.voice.find((v) => t >= v.start - 0.1 && t < v.start + v.dur + 0.35)?.text ?? null) : null;
  const rehearsal = IS_PROD ? [] : [{ text: "REHEARSAL · local build · not for publishing", amber: true }];
  if (seg.kind === "graphic") return { kind: "graphic", scene: seg.scene, t: local, cues: seg.cues, assets: A, badges: [], caption, variant };
  const { shot, f0, f1, dur } = seg;
  const len = Math.max(0.01, f1 - f0);
  const rate = len > dur ? len / dur : 1; // never slow footage down; hold the last frame instead
  const ft = Math.min(f0 + local * rate, f1);
  // zoom: ease from the previous shot's view (or full frame)
  const prev = tl.segs[segIdx - 1];
  const fromView = prev && prev.kind === "footage" ? zoomView(prev.shot.zoom) : FULL;
  const target = zoomView(shot.zoom);
  const same = JSON.stringify(fromView) === JSON.stringify(target);
  const view = same ? target : lerpView(fromView, target, ease(local / 0.8));
  const callouts = (shot.callouts ?? []).map((c) => {
    const b = mk(c.marker).boxes[c.box];
    if (!b) return null;
    const a0 = (c.at ?? 0) * dur, a1 = c.until == null ? Infinity : c.until * dur;
    let alpha = Math.min(ease((local - a0) / 0.35), c.until == null ? 1 : 1 - ease((local - a1) / 0.3));
    if (c.ftUntil && ft > at(c.ftUntil)) alpha = 0;
    if (c.ftFrom && ft < at(c.ftFrom)) alpha = 0;
    return { ...b, label: c.label, tone: c.tone, alpha: same || local > 0.8 ? alpha : 0, outline: c.outline !== false };
  }).filter(Boolean);
  const badges = [
    { live: IS_PROD, text: IS_PROD ? "Live product · college-operations-copilot.vercel.app" : "Local build" },
    { text: "Synthetic demonstration data" },
    ...(rate > 1.5 ? [{ text: `Sped up ×${rate < 10 ? rate.toFixed(0) : Math.round(rate)}`, amber: true }] : []),
    ...rehearsal,
  ];
  return {
    kind: "footage",
    src: frameAt(ft),
    view,
    callouts: callouts.map((c) => ({ ...c, w: c!.outline ? c!.w : 0, h: c!.outline ? c!.h : 0 })),
    lower: shot.lower === "attendance" ? lowerAttendance(ease((local - dur * 0.55) / 0.5)) : null,
    badges,
    caption,
  };
}

/* --------------------------------------------------------------- render */
async function openCompositor(): Promise<Page> {
  const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.addInitScript(`window.ICONS = ${JSON.stringify(ICONS)};`);
  await page.goto(fileUrl(path.join(ROOT, "scripts/video/compositor.html")));
  await page.evaluate(() => (window as unknown as { ready: Promise<boolean> }).ready);
  return page;
}

async function renderVideo(page: Page, tl: ReturnType<typeof buildTimeline>, variant: "main" | "short", out: string, range?: [number, number]) {
  const A = assets();
  const [a, b] = range ?? [0, tl.total];
  const n = Math.round((b - a) * FPS);
  const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS), out], { stdio: ["pipe", "inherit", "inherit"] });
  const started = Date.now();
  for (let i = 0; i < n; i++) {
    const t = a + i / FPS;
    await page.evaluate((s) => (window as unknown as { render: (s: unknown) => Promise<boolean> }).render(s), stateAt(tl, t, variant, A));
    const jpg = await page.screenshot({ type: "jpeg", quality: 93 });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 300 === 0) process.stdout.write(`  ${path.basename(out)} ${(t).toFixed(0)}s / ${b.toFixed(0)}s (${((Date.now() - started) / 1000).toFixed(0)}s elapsed)\n`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
}

function mixVoice(voice: Placed[], total: number, out: string, offset = 0) {
  const nS = Math.ceil(total * SR);
  const buf = new Int16Array(nS);
  for (const v of voice) {
    const pcm = readFileSync(v.file);
    const dataAt = pcm.indexOf("data") + 8;
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset + dataAt, Math.floor((pcm.length - dataAt) / 2));
    const s0 = Math.round((v.start - offset) * SR);
    for (let i = 0; i < samples.length && s0 + i < nS; i++) if (s0 + i >= 0) buf[s0 + i] = samples[i];
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + buf.byteLength, 4); header.write("WAVE", 8); header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(buf.byteLength, 40);
  writeFileSync(out, Buffer.concat([header, Buffer.from(buf.buffer)]));
}

function mux(video: string, audio: string | null, out: string) {
  const args = ["-v", "error", "-y", "-i", video];
  if (audio) args.push("-i", audio, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ar", String(SR));
  else args.push("-an");
  args.push("-c:v", "copy", "-movflags", "+faststart", "-shortest", out);
  execFileSync("ffmpeg", args);
}

const srtTime = (t: number) => {
  const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};

async function stills(page: Page, tl: ReturnType<typeof buildTimeline>) {
  const A = assets();
  const shot = async (t: number, file: string) => {
    await page.evaluate((s) => (window as unknown as { render: (s: unknown) => Promise<boolean> }).render(s), stateAt(tl, t, "main", A));
    await page.screenshot({ path: file, type: file.endsWith(".png") ? "png" : "jpeg", ...(file.endsWith(".jpg") ? { quality: 85 } : {}) });
  };
  const sc = (id: string) => tl.scenes.find((s) => s.id === id)!;
  await shot(sc("s04-architecture").start + sc("s04-architecture").dur - 0.2, path.join(DOCS, "current-system.png"));
  await shot(sc("s09-future").start + sc("s09-future").dur - 0.2, path.join(DOCS, "future-agents.png"));
  // One-page storyboard: a frame from each scene.
  const thumbs: string[] = [];
  for (const s of tl.scenes) {
    const f = path.join(WORK, `sb-${s.id}.jpg`);
    await shot(s.start + s.dur * (SHOTS[s.id] ? 0.45 : 0.85), f);
    thumbs.push(`data:image/jpeg;base64,${readFileSync(f).toString("base64")}`);
  }
  const color: Record<string, string> = { "CURRENT PRODUCT": "#4338ca", "FUTURE ROADMAP": "#b45309", PILOT: "#0f766e", CONTEXT: "#475569" };
  const cells = tl.scenes.map((s, i) => {
    const sc2 = SCENES.find((x) => x.id === s.id)!;
    return `<div class="cell"><img src="${thumbs[i]}"/><div class="meta"><b>${i + 1}. ${s.title}</b><span class="tag" style="background:${color[s.status]}">${s.status}</span><span class="dur">${s.dur.toFixed(0)} s</span></div><p>${sc2.lines[0].text}</p></div>`;
  }).join("");
  const total = tl.total;
  const sb = await page.context().browser()!.newPage(); // keep the compositor page intact
  await sb.setContent(`<html><head><style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111827; margin: 0; }
    h1 { font-size: 16pt; margin: 0 0 2mm; } .sub { font-size: 8.5pt; color: #4b5563; margin-bottom: 4mm; }
    .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3mm; }
    .cell img { width: 100%; border-radius: 2mm; border: 0.3mm solid #e5e7eb; display: block; }
    .meta { display: flex; align-items: center; gap: 2mm; font-size: 7.6pt; margin-top: 1.2mm; }
    .tag { color: #fff; border-radius: 1mm; padding: 0.3mm 1.2mm; font-size: 5.8pt; letter-spacing: .04em; }
    .dur { margin-left: auto; color: #6b7280; }
    p { font-size: 6.8pt; color: #374151; margin: 0.8mm 0 0; line-height: 1.3; }
  </style></head><body><h1>College Operations Copilot — product video storyboard</h1>
  <div class="sub">${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")} · 1920×1080 · narration: macOS ${VOICE} (Indian English) · demo recorded on the deployed app with synthetic data · CURRENT PRODUCT scenes show the deployed app; FUTURE ROADMAP is not built.</div>
  <div class="grid">${cells}</div></body></html>`);
  await sb.pdf({ path: path.join(DOCS, "STORYBOARD.pdf"), format: "A4", landscape: true, printBackground: true });
  await sb.close();
}

async function main() {
  const page = await openCompositor();
  const main = buildTimeline("main");
  console.log(`Main: ${main.total.toFixed(1)} s, ${main.voice.length} narration lines, voice ${VOICE} @ ${RATE}`);
  if (!ONLY || ONLY === "stills") await stills(page, main);
  if (!ONLY || ONLY === "main") {
    const v = path.join(WORK, "main-video.mp4"), a = path.join(WORK, "main-voice.wav");
    await renderVideo(page, main, "main", v);
    mixVoice(main.voice, main.total, a);
    mux(v, a, path.join(OUT, "College_Operations_Copilot_Product_Video.mp4"));
    writeFileSync(path.join(OUT, "College_Operations_Copilot_Product_Video.srt"), main.voice.map((x, i) => `${i + 1}\n${srtTime(x.start)} --> ${srtTime(x.start + x.dur)}\n${x.text}\n`).join("\n"));
    // The architecture animation on its own (scene 4, with its narration).
    const arch = main.scenes.find((s) => s.id === "s04-architecture")!;
    const av = path.join(WORK, "arch-video.mp4"), aa = path.join(WORK, "arch-voice.wav");
    await renderVideo(page, main, "main", av, [arch.start, arch.start + arch.dur]);
    mixVoice(main.voice.filter((x) => x.start >= arch.start && x.start < arch.start + arch.dur), arch.dur, aa, arch.start);
    mux(av, aa, path.join(OUT, "College_Operations_Copilot_Architecture.mp4"));
  }
  if (!ONLY || ONLY === "short") {
    const short = buildTimeline("short");
    console.log(`Short: ${short.total.toFixed(1)} s`);
    const v = path.join(WORK, "short-video.mp4"), a = path.join(WORK, "short-voice.wav");
    await renderVideo(page, short, "short", v);
    mixVoice(short.voice, short.total, a);
    mux(v, a, path.join(OUT, "College_Operations_Copilot_Short.mp4"));
  }
  writeFileSync(path.join(WORK, "timeline.json"), JSON.stringify({ voice: VOICE, rate: RATE, production: IS_PROD, scenes: main.scenes, total: main.total }, null, 1));
  await page.context().browser()?.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
