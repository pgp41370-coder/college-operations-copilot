/**
 * Writes docs/video/NARRATION.md and docs/video/SHOT_LIST.md from
 * scripts/video/script.ts (the single source for the product video).
 *
 *   npx tsx scripts/video/docs.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SCENES, SHORT } from "./script";

const OUT = path.join(process.cwd(), "docs", "video");
mkdirSync(OUT, { recursive: true });

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

let n = `# Product video — narration

Generated from \`scripts/video/script.ts\`. Edit that file, then run \`npx tsx scripts/video/docs.mts\`.

- **Voice:** macOS Indian English voice (default \`Aman\`, alternative \`Tara\`), rate 185. Set \`VIDEO_VOICE\` / \`VIDEO_RATE\` to change.
- **Labels:** each scene is marked CONTEXT, CURRENT PRODUCT, FUTURE ROADMAP or PILOT. Only CURRENT PRODUCT scenes describe what the deployed app does today.
- **Order:** the live demo is split around the conflict and attendance scenes (5A → 6 → 7 → 5B) so the recording follows the real workflow order.

`;
for (const s of SCENES) {
  n += `## ${s.title} · \`${s.status}\`\n\n`;
  for (const l of s.lines) n += `> ${l.text}\n>\n`;
  n = n.replace(/>\n$/, "\n");
  if (s.evidence) n += `Verified against: ${s.evidence}\n\n`;
}
n += `## Short version (30–45 s, for a CV or LinkedIn)\n\n`;
for (const s of SHORT) for (const l of s.lines) n += `> ${l.text}\n>\n`;
n = n.replace(/>\n$/, "\n");
n += `\nWord count: full ${SCENES.flatMap((s) => s.lines).reduce((a, l) => a + words(l.text), 0)}, short ${SHORT.flatMap((s) => s.lines).reduce((a, l) => a + words(l.text), 0)}.\n`;
writeFileSync(path.join(OUT, "NARRATION.md"), n);

let s = `# Product video — storyboard, shot list and recording plan

Generated from \`scripts/video/script.ts\`.

## Storyboard

| # | Scene | Label | Planned | Visual |
|---|---|---|---|---|
`;
SCENES.forEach((sc, i) => {
  s += `| ${i + 1} | ${sc.title} | ${sc.status} | ${sc.target} s | ${sc.visual.replace(/\|/g, "/")} |\n`;
});
s += `\n## Shot list\n\n`;
SCENES.forEach((sc, i) => {
  s += `### ${i + 1}. ${sc.title}\n\n${sc.shots.map((x) => `- ${x}`).join("\n")}\n\n`;
});
s += `## Screen recording plan

The demo is recorded on the **deployed production app**, not a local copy and not a mock-up.

1. **Who runs it.** The account owner runs \`npx tsx scripts/video/record-product.mts\` in a terminal. It asks for an administrator email and password in a hidden prompt; they stay in memory and are never printed, saved or recorded.
2. **Demo identity.** Off camera, the script uses the administrator session only to create a temporary faculty account named "Demo Faculty (synthetic)" with a \`@demo-video.invalid\` address and a random password. Everything on camera is done as that account, so no real name or email appears.
3. **Data.** Only the synthetic documents from \`scripts/demo/make-demo-docs.mts\` are uploaded (fictional event, fictional students). A badge "Synthetic demonstration data" is shown on every demo frame.
4. **Capture.** Chromium at 1920×1080, captured frame by frame through the DevTools screencast (JPEG quality 92) with timestamps, so the edit keeps real timing. The script records markers and on-screen element positions for callouts.
5. **Clean takes.** If any step fails, the script stops and the take is discarded; it is re-run from the start. No debugging screens are used.
6. **Clean-up (off camera).** The demo activity is archived and the temporary account is deactivated. Pilot metrics exclude accounts on \`.invalid\` addresses, so this run does not count as pilot usage.
7. **Never shown.** Passwords (fields show dots), API keys, database credentials, real student data, personal email addresses, private reference documents.

## Editing

- Clean cuts; subtle zooms toward the region being discussed; callout boxes with short labels ("Evidence source", "Conflict detected", "Human review required", "Report approved").
- Diagrams and title cards are HTML/CSS rendered frame by frame (no stock footage, no AI imagery).
- No background music. Narration is always the only audio.
- Future agents appear only inside a scene labelled **FUTURE ROADMAP — not built yet**.
`;
writeFileSync(path.join(OUT, "SHOT_LIST.md"), s);
console.log("wrote docs/video/NARRATION.md and docs/video/SHOT_LIST.md");
