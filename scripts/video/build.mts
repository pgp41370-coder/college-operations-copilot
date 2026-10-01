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
const RATE = process.env.VIDEO_RATE ?? "160";
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
  const probe = (f: string) => {
    try {
      return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }));
    } catch {
      return NaN;
    }
  };
  if (!existsSync(wav)) {
    // The macOS voice occasionally renders a line far slower than asked; take
    // three renders and keep the median-length one so the pace stays even.
    const takes: { f: string; d: number }[] = [];
    const minDur = text.split(/\s+/).length * 0.18; // a real take is never this short
    for (let i = 0; i < 8 && takes.length < 3; i++) {
      const aiff = path.join(AUDIO, `${key}-${i}.aiff`), out = path.join(AUDIO, `${key}-${i}.wav`);
      execFileSync("say", ["-v", VOICE, "-r", RATE, "-o", aiff, text]);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", aiff, "-af", "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse", "-ar", String(SR), "-ac", "1", "-c:a", "pcm_s16le", out]);
      const d = probe(out);
      if (Number.isFinite(d) && d >= minDur) takes.push({ f: out, d });
    }
    if (takes.length === 0) throw new Error(`speech synthesis failed for: ${text}`);
    while (takes.length < 3) takes.push(takes[takes.length - 1]);
    takes.sort((x, y) => x.d - y.d);
    execFileSync("cp", [takes[1].f, wav]);
  }
  return { file: wav, dur: probe(wav) };
}

/* ---------------------------------------------------------------- shots */
/** at/until: fraction of the shot. ftUntil: hide once the recording passes this moment (the layout changes there). */
type Callout = { marker: string; box: string; label?: string; tone?: "danger" | "success" | "warning"; at?: number; until?: number; ftUntil?: [string, number]; ftFrom?: [string, number]; outline?: boolean };
type Shot = { from: [string, number]; to: [string, number]; zoom?: { marker: string; box: string; minW?: number }; callouts?: Callout[]; lower?: "attendance" | "legend" };
const SHOTS: Record<string, Shot[][]> = {
  "w01-signin": [
    [{ from: ["login", 0], to: ["login", 1.4] }],
    [{ from: ["login", 1.4], to: ["login-submitted", 1.2], callouts: [{ marker: "login", box: "form", label: "Your email and password", ftUntil: ["login-click", -0.3] }, { marker: "login-click", box: "button", label: "Click “Sign in”", ftFrom: ["login-click", -0.2], ftUntil: ["login-click", 0.6] }] }],
  ],
  "w02-dashboard": [
    [{ from: ["login-submitted", 1.2], to: ["dashboard", 0] }],
    [{ from: ["dashboard", 0], to: ["dash-attention", 0], callouts: [{ marker: "dashboard", box: "kpis", label: "Your activities, at a glance", at: 0.1 }] }],
    [{ from: ["dash-attention", 0], to: ["create", -1.4], callouts: [{ marker: "dash-attention", box: "attention", label: "What needs your attention", ftUntil: ["dash-create", 0] }, { marker: "dash-create", box: "button", label: "Click “Create Activity”", ftFrom: ["dash-create", 0] }] }],
  ],
  "w03-create": [
    [{ from: ["create", 0], to: ["create-form", 0], callouts: [{ marker: "create", box: "stepper", label: "The whole journey, in 7 steps", at: 0.1 }] }],
    [{ from: ["create-form", 0], to: ["create-template", 0] }],
    [{ from: ["create-template", 0], to: ["create-submit", 2.0], callouts: [{ marker: "create-template", box: "template", label: "Your department's report format", ftUntil: ["create-submit", 0] }, { marker: "create-submit", box: "button", label: "Click to continue", ftFrom: ["create-submit", 0] }] }],
  ],
  "w04-upload": [
    [{ from: ["upload", 0], to: ["upload-notice", 0], callouts: [{ marker: "upload", box: "kind", label: "1 · Choose the type of document", ftUntil: ["upload", 2.6] }, { marker: "upload", box: "dropzone", label: "2 · Drop the file here, or browse", ftFrom: ["upload", 2.6] }] }],
    [{ from: ["upload-notice", 0], to: ["upload-report", 0], callouts: [{ marker: "upload", box: "dropzone", label: "PDF, JPG or PNG · up to 4 MB each", at: 0.1 }] }],
    [{ from: ["upload-report", 0], to: ["upload-poster", 0] }],
    [{ from: ["upload-poster", 0], to: ["upload-photo", 0] }],
    [{ from: ["upload-photo", 0], to: ["upload-done", 0] }],
    [{ from: ["upload-done", 0], to: ["upload-list", 5], callouts: [{ marker: "upload-done", box: "jobs", label: "Each file uploaded and read", ftUntil: ["upload-list", -1.2] }, { marker: "upload-list", box: "list", label: "Your documents", ftFrom: ["upload-list", 0], outline: false }] }],
  ],
  "w05-overview": [
    [{ from: ["overview", -2.4], to: ["overview", 3], callouts: [{ marker: "overview", box: "trust", label: "A summary of every detail", ftFrom: ["overview", 0] }] }],
    [{ from: ["overview", 3], to: ["overview-issues", -1.0], lower: "legend", callouts: [{ marker: "overview", box: "trust", ftUntil: ["overview-issues", -1.2] }] }],
    [{ from: ["overview-issues", 0], to: ["overview-issues", 5], callouts: [{ marker: "overview-issues", box: "issues", label: "What still needs your attention", at: 0.05 }] }],
  ],
  "w06-review": [
    [{ from: ["review-start", -1.6], to: ["review", 0] }],
    [{ from: ["review", 0], to: ["review", 6.2], zoom: { marker: "review", box: "field", minW: 1500 }, callouts: [{ marker: "review", box: "source", label: "Where it came from: document and page", ftFrom: ["review", 2.8] }] }],
    [{ from: ["review", 6.2], to: ["preview", 5.6], callouts: [{ marker: "preview", box: "panel", label: "The original page, beside the text the app read", ftFrom: ["preview", 0], outline: false }] }],
    [{ from: ["lowconf", 0], to: ["lowconf-done", 1.5], zoom: { marker: "lowconf", box: "card", minW: 1500 }, callouts: [{ marker: "lowconf", box: "badge", label: "Needs review: please check", tone: "warning", ftUntil: ["lowconf", 3.6] }, { marker: "lowconf", box: "confirm", label: "Then click “Confirm”", ftFrom: ["lowconf", 3.6], ftUntil: ["lowconf-click", 0.4] }] }],
  ],
  "w07-conflict": [
    [{ from: ["conflict", 0], to: ["conflict-poster", 0], zoom: { marker: "conflict", box: "card", minW: 1400 }, callouts: [{ marker: "conflict", box: "banner", label: "The documents disagree", tone: "danger", at: 0.15 }] }],
    [{ from: ["conflict-poster", 0], to: ["choose", -3.5], zoom: { marker: "conflict", box: "card", minW: 1400 }, callouts: [{ marker: "conflict", box: "poster", label: "Poster: 31 October", tone: "danger", at: 0.05 }, { marker: "conflict", box: "notice", label: "Notice: 6 November", ftFrom: ["conflict-others", 0] }, { marker: "conflict", box: "report", label: "Activity report: 6 November", ftFrom: ["conflict-others", 0.8] }, { marker: "conflict", box: "attendance", label: "Attendance sheet: 6 November", ftFrom: ["conflict-others", 1.6] }] }],
    [{ from: ["choose", -3.5], to: ["choose", 0], zoom: { marker: "conflict", box: "card", minW: 1400 }, callouts: [{ marker: "conflict", box: "banner", label: "Cannot be approved until you decide", tone: "warning", at: 0.05 }] }],
    [{ from: ["choose", 0], to: ["chosen", 4.5], zoom: { marker: "conflict", box: "card", minW: 1400 }, callouts: [{ marker: "choose", box: "button", label: "You choose the correct date", ftUntil: ["choose", 2.0] }, { marker: "chosen", box: "card", label: "Your choice is recorded", tone: "success", ftFrom: ["chosen", 0] }] }],
  ],
  "w08-attendance": [
    [{ from: ["attendance-rows", -2.6], to: ["attendance-rows", 1.0] }],
    [{ from: ["attendance-rows", 1.0], to: ["attendance-rows", 6.0], callouts: [{ marker: "attendance-rows", box: "status", label: "Needs verification", tone: "warning", at: 0.05 }] }],
    [{ from: ["attendance", 0], to: ["attendance-add", -1.2], callouts: [{ marker: "attendance", box: "stats", label: "Report says 8 · sheet shows 7 names", tone: "danger", ftUntil: ["attendance", 3.8] }, { marker: "attendance", box: "recon", label: "So the counts differ", tone: "danger", ftFrom: ["attendance", 3.8], ftUntil: ["attendance-add", -1.4] }] }],
    [{ from: ["attendance-add", 0], to: ["attendance-added", 1.0], callouts: [{ marker: "attendance-add", box: "row", label: "Add the missing name", at: 0.05, ftUntil: ["attendance-added", 0.2] }] }],
    [{ from: ["attendance-added", 1.0], to: ["verify-confirm", 3.2], callouts: [{ marker: "verify-confirm", box: "dialog", label: "Confirm, after checking every name", ftFrom: ["verify-confirm", 0] }] }],
    [{ from: ["reconciled", 0], to: ["reconciled", 5.0], lower: "attendance", callouts: [{ marker: "reconciled", box: "badge", label: "The numbers match", tone: "success", at: 0.05 }] }],
  ],
  "w09-reports": [
    [{ from: ["reports", 0], to: ["paper", -0.5], callouts: [{ marker: "reports", box: "button", label: "Click “Generate reports”", ftUntil: ["generated", -1.0] }, { marker: "generated", box: "cards", label: "Three reports", ftFrom: ["generated", 0] }] }],
    [{ from: ["paper", 0], to: ["paper-np", -0.6], callouts: [{ marker: "paper", box: "paper", label: "Your department's format · sample event", at: 0.1 }] }],
    [{ from: ["paper-np", 0], to: ["paper-np", 6.0], zoom: { marker: "paper-np", box: "np", minW: 1300 }, callouts: [{ marker: "paper-np", box: "np", label: "“Not provided”: not found in any document", tone: "warning", at: 0.1 }] }],
    [{ from: ["paper-np", 6.0], to: ["attsum", 3.5] }],
    [{ from: ["draft-note", 0], to: ["draft-note", 3.5], callouts: [{ marker: "draft-note", box: "cards", label: "Marked “Draft” until approved", tone: "warning", at: 0.05 }] }],
  ],
  "w10-approve": [
    [{ from: ["approve", -1.6], to: ["approve", 5.2], callouts: [{ marker: "approve", box: "checklist", label: "Every check has passed", tone: "success", ftFrom: ["approve", 0] }] }],
    [{ from: ["approve", 5.2], to: ["approve-click", 0.4], callouts: [{ marker: "approve", box: "button", label: "Only a teacher can approve", ftFrom: ["approve", 5.0] }] }],
    [{ from: ["approve-click", 0.4], to: ["approved", 5.0], callouts: [{ marker: "approved", box: "header", label: "Your name and the time are recorded", tone: "success", ftFrom: ["approved", 0] }] }],
  ],
  "w11-download": [
    [{ from: ["exports", -1.6], to: ["dl-packet", 0], callouts: [{ marker: "dl-docx", box: "button", label: "Word file: to edit, then print", ftFrom: ["dl-docx", 0], ftUntil: ["dl-pdf", 0] }, { marker: "dl-pdf", box: "button", label: "PDF: to print directly", ftFrom: ["dl-pdf", 0], ftUntil: ["dl-packet", 0] }] }],
    [{ from: ["dl-packet", 0], to: ["audit", -1.6], callouts: [{ marker: "dl-packet", box: "button", label: "Everything in one file", at: 0.05 }] }],
  ],
  "w12-history": [
    [{ from: ["audit", -1.6], to: ["feedback", -1.6], callouts: [{ marker: "audit", box: "timeline", label: "Every action: who, and when", ftFrom: ["audit", 0], ftUntil: ["audit", 3.0], outline: false }] }],
  ],
  "w13-feedback": [
    [{ from: ["feedback", -1.6], to: ["feedback-filled", 0], callouts: [{ marker: "feedback", box: "card", label: "Asked after approval", ftFrom: ["feedback", 0], ftUntil: ["feedback", 3.0] }] }],
    [{ from: ["feedback-filled", 0], to: ["feedback-saved", 3.5], callouts: [{ marker: "feedback-saved", box: "card", label: "Saved · only administrators can see it", tone: "success", ftFrom: ["feedback-saved", 0] }] }],
    [], // the administrator's Pilot page still (graphic)
  ],
};

/* ------------------------------------------------------------- timeline */
type View = Box;
const FULL: View = { x: 0, y: 0, w: 1920, h: 1080 };
type Seg =
  | { kind: "graphic"; scene: string; start: number; dur: number; cues: number[]; step?: string; sceneStart: number }
  | { kind: "footage"; start: number; dur: number; shot: Shot; f0: number; f1: number; step?: string; sceneStart: number };
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
    const lead = variant === "short" ? 0.25 : isDemo ? 0.7 : 0.8;
    const tail = variant === "short" ? 0.25 : 0.5;
    const start = cursor;
    let t = start + lead;
    const lineTimes: { start: number; dur: number }[] = [];
    for (const l of lines) {
      const s = synth(l);
      voice.push({ file: s.file, start: t, dur: s.dur, text: l.text });
      lineTimes.push({ start: t, dur: s.dur + (l.pause ?? 0.6) });
      t += s.dur + (l.pause ?? 0.6);
    }
    const end = t + tail;
    if (!isDemo) {
      const n = scene.lines.length;
      const cues = variant === "main" ? lineTimes.map((x) => x.start - start) : Array.from({ length: n }, (_, i) => 0.15 + (i * (end - start) * 0.72) / n);
      segs.push({ kind: "graphic", scene: scene.id, start, dur: end - start, cues, sceneStart: start });
    } else {
      // Short version: one representative shot per demo scene.
      const plan: { shots: Shot[]; s: number; e: number }[] =
        variant === "main"
          ? lineTimes.map((lt, i) => ({ shots: SHOTS[scene.id][i], s: i === 0 ? start : lt.start, e: i === lineTimes.length - 1 ? end : lineTimes[i + 1].start }))
          : [{ shots: SHORT_SHOTS[scene.id], s: start, e: end }];
      for (const p of plan) {
        if (!p.shots.length) {
          segs.push({ kind: "graphic", scene: "metrics", start: p.s, dur: p.e - p.s, cues: [0], step: scene.step, sceneStart: start });
          continue;
        }
        const lens = p.shots.map((sh) => Math.max(0.2, at(sh.to) - at(sh.from)));
        const weights = lens.map((l) => Math.min(Math.max(l, 1.6), 10));
        const W = weights.reduce((a, b) => a + b, 0);
        let s = p.s;
        p.shots.forEach((sh, k) => {
          const d = ((p.e - p.s) * weights[k]) / W;
          segs.push({ kind: "footage", start: s, dur: d, shot: sh, f0: at(sh.from), f1: at(sh.to), step: variant === "main" ? scene.step : undefined, sceneStart: start });
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
  "w06-review": [SHOTS["w06-review"][1][0]],
  "w07-conflict": [SHOTS["w07-conflict"][1][0]],
  "w08-attendance": [SHOTS["w08-attendance"][1][0]],
  "w10-approve": [{ from: ["approve", 4.0], to: ["approved", 3.0], callouts: [{ marker: "approve", box: "button", label: "Only a teacher can approve", ftUntil: ["approve-click", 0.4] }, { marker: "approved", box: "header", label: "Name and time recorded", tone: "success", ftFrom: ["approved", 0] }] }],
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
  return `<div class="lower" style="opacity:${alpha};bottom:190px">${step("Read from the sheet", "rgba(251,191,36,.16)", "#fde68a")}${arrow}${step("Needs verification", "rgba(251,191,36,.16)", "#fde68a")}${arrow}${step("Checked by you", "rgba(99,102,241,.22)", "#c7d2fe")}${arrow}${step("Verified", "rgba(52,211,153,.18)", "#a7f3d0")}</div>`;
}

/** Captions: the spoken line, split into sentence-sized pieces timed by length. */
function captionAt(tl: ReturnType<typeof buildTimeline>, t: number): string | null {
  const v = tl.voice.find((x) => t >= x.start - 0.15 && t < x.start + x.dur + 0.45);
  if (!v) return null;
  const parts: string[] = [];
  for (const sentence of v.text.split(/(?<=[.!?])\s+/)) {
    if (sentence.length <= 95) { parts.push(sentence); continue; }
    let cur = "";
    for (const piece of sentence.split(/(?<=[,:;])\s+/)) {
      if (cur && (cur + " " + piece).length > 95) { parts.push(cur); cur = piece; }
      else cur = cur ? `${cur} ${piece}` : piece;
    }
    if (cur) parts.push(cur);
  }
  const total = parts.reduce((a, p) => a + p.length, 0);
  let acc = v.start;
  for (const p of parts) {
    const d = (v.dur * p.length) / total;
    if (t < acc + d) return p;
    acc += d;
  }
  return parts[parts.length - 1];
}

function lowerLegend(alpha: number) {
  const item = (c: string, t: string) => `<span class="step" style="display:inline-flex;align-items:center;gap:10px;color:#e5e7eb"><span style="width:16px;height:16px;border-radius:4px;background:${c}"></span>${t}</span>`;
  return `<div class="lower" style="opacity:${alpha};bottom:190px">${item("#4f46e5", "From a document")}${item("#d97706", "Please check")}${item("#dc2626", "Documents disagree")}${item("#9ca3af", "Not found")}${item("#059669", "Checked by you")}</div>`;
}

function stateAt(tl: ReturnType<typeof buildTimeline>, t: number, variant: "main" | "short", A: ReturnType<typeof assets>) {
  const segIdx = tl.segs.findIndex((s) => t >= s.start && t < s.start + s.dur);
  const seg = tl.segs[segIdx === -1 ? tl.segs.length - 1 : segIdx];
  const local = t - seg.start;
  const caption = captionAt(tl, t);
  const stepAlpha = Math.min(ease((t - seg.sceneStart) / 0.4), 1);
  const rehearsal = IS_PROD ? [] : [{ text: "REHEARSAL · local build · not for publishing", amber: true }];
  if (seg.kind === "graphic") return { kind: "graphic", scene: seg.scene, t: local, cues: seg.cues, assets: A, badges: [], caption, variant, step: seg.step, stepAlpha };
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
    lower: shot.lower === "attendance" ? lowerAttendance(ease((local - dur * 0.35) / 0.5)) : shot.lower === "legend" ? lowerLegend(ease((local - 0.2) / 0.5)) : null,
    badges,
    caption,
    step: seg.step,
    stepAlpha,
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
  let lastKey = "", lastJpg: Buffer | null = null;
  for (let i = 0; i < n; i++) {
    const t = a + i / FPS;
    const state = stateAt(tl, t, variant, A);
    // Held screens produce identical frames: reuse the last image instead of re-rendering.
    const key = JSON.stringify(state, (k, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v));
    let jpg: Buffer;
    if (key === lastKey && lastJpg && state.kind === "footage") jpg = lastJpg;
    else {
      await page.evaluate((s) => (window as unknown as { render: (s: unknown) => Promise<boolean> }).render(s), state);
      jpg = await page.screenshot({ type: "jpeg", quality: 93 });
    }
    lastKey = key;
    lastJpg = jpg;
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
    await page.evaluate((s) => (window as unknown as { render: (s: unknown) => Promise<boolean> }).render(s), { ...stateAt(tl, t, "main", A), caption: null });
    await page.screenshot({ path: file, type: file.endsWith(".png") ? "png" : "jpeg", ...(file.endsWith(".jpg") ? { quality: 85 } : {}) });
  };
  const sc = (id: string) => tl.scenes.find((s) => s.id === id)!;
  await shot(sc("g04-how").start + sc("g04-how").dur - 0.2, path.join(DOCS, "current-system.png"));
  await shot(sc("g09-future").start + sc("g09-future").dur - 0.2, path.join(DOCS, "future-agents.png"));
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
    .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2.2mm; }
    .cell img { width: 100%; border-radius: 2mm; border: 0.3mm solid #e5e7eb; display: block; }
    .meta { display: flex; align-items: center; gap: 1.5mm; font-size: 6.8pt; margin-top: 1mm; }
    .tag { color: #fff; border-radius: 1mm; padding: 0.3mm 1.2mm; font-size: 5.8pt; letter-spacing: .04em; }
    .dur { margin-left: auto; color: #6b7280; }
    p { font-size: 6pt; color: #374151; margin: 0.6mm 0 0; line-height: 1.25; max-height: 11mm; overflow: hidden; }
  </style></head><body><h1>College Operations Copilot — product video storyboard</h1>
  <div class="sub">${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")} · 1920×1080 · for teachers · step-by-step · narration: macOS ${VOICE} (Indian English), captions on screen · demo recorded on the deployed app with sample data · CURRENT PRODUCT scenes show the deployed app; FUTURE ROADMAP is not built.</div>
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
    const arch = main.scenes.find((s) => s.id === "g04-how")!;
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
