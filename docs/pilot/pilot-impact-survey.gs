/**
 * Evidentra / College Operations Copilot — PILOT IMPACT SURVEY (Google Apps Script)
 *
 * Creates a Google Form + linked Google Sheet that measure the pilot's impact:
 *   time (manual vs app, with how it was measured) · accuracy & trust · issues caught ·
 *   feature usefulness (incl. AI agents) · usability (System Usability Scale) ·
 *   adoption & NPS · HoD / IQAC verdict · quotable feedback (with permission).
 * An "Impact Summary" tab is recalculated on every submission, including CV-ready lines
 * filled ONLY with the measured numbers.
 *
 * How to use (5 minutes):
 *   1. script.google.com → New project → paste this file → Save.
 *   2. Run `createPilotSurvey` → allow the permissions. The log shows the form link, the
 *      form edit link and the results sheet link.
 *   3. Send the form link to pilot faculty and the HoD AFTER they have used the app.
 *   4. Results: open the sheet → "Impact Summary" tab (updates on every submission; you can
 *      also run `updateImpactSummary` by hand).
 *
 * Privacy: no email collection, no student data asked; a name is asked only from people who
 * agree to be quoted with their name.
 */

const FACULTY = 'I used the app to prepare activity reports (faculty)';
const REVIEWER = 'I reviewed / approved pilot reports (HoD / IQAC)';
const HOW = ['Timed it with a clock or stopwatch', 'A careful estimate', 'A rough guess'];
const FEATURES = [
  'Source page shown for every value',
  'Date / number conflict warnings',
  'Attendance count check',
  '"Missing document" notice',
  'Document-type check',
  'Agent check (Overview tab)',
  'AI-drafted paragraphs',
  'Generated activity report & packet',
  'Audit log',
];
const SUS = [ // System Usability Scale (Brooke, 1986), wording adapted to "this tool"
  'I think that I would like to use this tool frequently.',
  'I found the tool unnecessarily complex.',
  'I thought the tool was easy to use.',
  'I think that I would need the support of a technical person to be able to use this tool.',
  'I found the various functions in this tool were well integrated.',
  'I thought there was too much inconsistency in this tool.',
  'I would imagine that most people would learn to use this tool very quickly.',
  'I found the tool very cumbersome to use.',
  'I felt very confident using the tool.',
  'I needed to learn a lot of things before I could get going with this tool.',
];

// Question titles (also used to read the answers back)
const Q = {
  consent: 'I agree to take part in this pilot feedback survey. My answers are used only to evaluate the tool, and I can skip optional questions.',
  role: 'What was your role in the pilot?',
  dept: 'Department',
  years: 'Years in academia',
  perSem: 'About how many activity reports do you prepare in a semester?',
  manualMin: 'BEFORE the pilot: how many minutes did your most recent activity report take the manual way? (from collecting the documents to a final report)',
  manualHow: 'How did you get that manual time?',
  mismatch: 'In manually prepared reports, how often do details differ between documents (e.g. poster date vs notice date, stated count vs attendance sheet)?',
  rounds: 'How many correction rounds does a manual report usually go through before it is approved?',
  appReports: 'How many activity reports did you prepare in the app during the pilot?',
  completed: 'Did you complete at least one report in the app up to "approved"?',
  docs: 'Which documents did you upload in the app?',
  appMin: 'WITH THE APP: how many minutes did your most recent report take? (from upload to an approval-ready report)',
  appHow: 'How did you get that app time?',
  noEdit: 'Roughly what share of the filled-in fields were correct without any edit?',
  caught: 'Did the app flag a mismatch or missing document that you might otherwise have missed?',
  caughtN: 'If yes: about how many such issues did it flag across your reports?',
  wrong: 'Did any WRONG value reach your final report without you noticing it at first?',
  trust: 'I trust the values the app fills in, because each one shows the document and page it came from.',
  features: 'How useful was each feature?',
  draft: 'If you used an AI-drafted paragraph, how much editing did it need?',
  sus: 'Usability: how much do you agree with each statement? (1 = Strongly disagree, 5 = Strongly agree)',
  next: 'Would you use this tool for your next activity report?',
  nps: 'How likely are you to recommend this tool to a colleague?',
  adopt: 'Should the department use this tool for all activity reports?',
  valuable: 'Which features saved you the most effort? (pick up to 3)',
  barrier: 'What would stop you from using it regularly?',
  improve: 'What ONE improvement would help you most?',
  quote: 'In one sentence, how would you describe this tool to a colleague?',
  quotePerm: 'May we quote that sentence (e.g. in a pilot report or presentation)?',
  name: 'Your name and designation (only if you chose "with my name")',
  hReviewed: 'How many pilot reports did you review?',
  hQuality: 'Compared with earlier manually prepared reports, the pilot reports were…',
  hTime: 'Time you spend reviewing one report, compared with before:',
  hErrors: 'Errors you found in the pilot reports:',
  hTrace: 'Being able to see the source page of every value makes review / audit easier.',
  hDecision: 'Your recommendation for the department:',
  hQuote: 'In one sentence, your view of the tool:',
  hQuotePerm: 'May we quote your sentence?',
  hName: 'Your name and designation (only if you chose "with my name")',
};
const QUOTE_PERM = ['Yes, with my name and designation', 'Yes, anonymously (role only)', 'No'];

function createPilotSurvey() {
  const form = FormApp.create('Activity Report Tool — Pilot Feedback (5–8 min)');
  form.setDescription(
    'Thank you for trying the activity-report tool. This short survey measures whether it actually saves time and ' +
    'improves report quality. Please answer from your real experience in the pilot — honest "no" answers are just ' +
    'as useful. No student data is asked.')
    .setCollectEmail(false).setProgressBar(true).setShowLinkToRespondAgain(false)
    .setConfirmationMessage('Thank you! Your feedback directly decides what gets improved next.');

  const num = (title, max, help, required) => {
    const v = FormApp.createTextValidation().requireNumberBetween(0, max).setHelpText(`Enter a number from 0 to ${max}.`).build();
    return form.addTextItem().setTitle(title).setHelpText(help || '').setValidation(v).setRequired(required !== false);
  };
  const scale = (title, lo, hi, loLabel, hiLabel, required) =>
    form.addScaleItem().setTitle(title).setBounds(lo, hi).setLabels(loLabel, hiLabel).setRequired(required !== false);
  const mc = (title, choices, required) => form.addMultipleChoiceItem().setTitle(title).setChoiceValues(choices).setRequired(required !== false);

  // ---- Page 1: consent; page 2: role (one branching question per page)
  const consent = form.addMultipleChoiceItem().setTitle(Q.consent).setRequired(true);
  form.addPageBreakItem().setTitle('Your role');
  const role = form.addMultipleChoiceItem().setTitle(Q.role).setRequired(true);

  // ---- Faculty pages
  const pProfile = form.addPageBreakItem().setTitle('About you');
  form.addTextItem().setTitle(Q.dept).setRequired(false);
  mc(Q.years, ['0–5', '6–10', '11–20', 'More than 20'], false);
  mc(Q.perSem, ['1–2', '3–5', '6–10', 'More than 10']);

  form.addPageBreakItem().setTitle('Before the pilot (manual way)')
    .setHelpText('Think of your most recent activity report made WITHOUT the tool.');
  num(Q.manualMin, 600, 'Minutes, e.g. 60. Your best figure is fine — the next question records how exact it is.');
  mc(Q.manualHow, HOW);
  mc(Q.mismatch, ['Never', 'Rarely', 'Sometimes', 'Often', 'Very often', "Don't know"]);
  mc(Q.rounds, ['0', '1', '2', '3 or more', "Don't know"]);

  form.addPageBreakItem().setTitle('Using the app');
  num(Q.appReports, 50);
  mc(Q.completed, ['Yes', 'No']);
  form.addCheckboxItem().setTitle(Q.docs).setChoiceValues(
    ['Poster', 'Notice', 'Existing activity report', 'Existing detailed report', 'Attendance sheet', 'Photographs', 'Other supporting documents']).setRequired(false);
  num(Q.appMin, 600, 'Minutes for your most recent report in the app, including checking and correcting values.');
  mc(Q.appHow, HOW);

  form.addPageBreakItem().setTitle('Accuracy & trust');
  mc(Q.noEdit, ['90–100%', '75–89%', '50–74%', 'Below 50%', 'Not sure']);
  mc(Q.caught, ['Yes', 'No', 'Not sure']);
  num(Q.caughtN, 100, '', false);
  mc(Q.wrong, ['No', 'Yes', 'Not sure']);
  scale(Q.trust, 1, 5, 'Strongly disagree', 'Strongly agree');

  form.addPageBreakItem().setTitle('Features');
  form.addGridItem().setTitle(Q.features).setRows(FEATURES).setColumns(['Not used', '1', '2', '3', '4', '5'])
    .setHelpText('1 = Not useful, 5 = Very useful').setRequired(false);
  mc(Q.draft, ['Did not use', 'No edits', 'Minor edits', 'Major edits', 'Rewrote it'], false);

  form.addPageBreakItem().setTitle('Ease of use');
  form.addGridItem().setTitle(Q.sus).setRows(SUS).setColumns(['1', '2', '3', '4', '5']).setRequired(true);

  form.addPageBreakItem().setTitle('Would you keep using it?');
  mc(Q.next, ['Definitely', 'Probably', 'Not sure', 'Probably not', 'Definitely not']);
  scale(Q.nps, 0, 10, 'Not at all likely', 'Extremely likely');
  mc(Q.adopt, ['Yes', 'Yes, after some improvements', 'Not sure', 'No']);
  form.addCheckboxItem().setTitle(Q.valuable).setChoiceValues(FEATURES)
    .setValidation(FormApp.createCheckboxValidation().requireSelectAtMost(3).build()).setRequired(false);
  form.addParagraphTextItem().setTitle(Q.barrier).setRequired(false);
  form.addParagraphTextItem().setTitle(Q.improve).setRequired(false);
  form.addParagraphTextItem().setTitle(Q.quote).setRequired(false);
  mc(Q.quotePerm, QUOTE_PERM, false);
  form.addTextItem().setTitle(Q.name).setRequired(false);

  // ---- HoD / IQAC page (faculty submit before reaching it)
  const pReviewer = form.addPageBreakItem().setTitle('HoD / IQAC review')
    .setGoToPage(FormApp.PageNavigationType.SUBMIT); // faculty reaching this break by order → submit
  num(Q.hReviewed, 100);
  scale(Q.hQuality, 1, 5, 'Much worse', 'Much better');
  mc(Q.hTime, ['Much less', 'Less', 'About the same', 'More', 'Much more']);
  mc(Q.hErrors, ['None', 'Minor only', 'At least one major error']);
  scale(Q.hTrace, 1, 5, 'Strongly disagree', 'Strongly agree');
  mc(Q.hDecision, ['Adopt for the department', 'Adopt after the improvements I mention', 'Extend the pilot first', 'Do not adopt']);
  form.addParagraphTextItem().setTitle(Q.improve + ' (HoD / IQAC)').setRequired(false);
  form.addParagraphTextItem().setTitle(Q.hQuote).setRequired(false);
  mc(Q.hQuotePerm, QUOTE_PERM, false);
  form.addTextItem().setTitle(Q.hName).setRequired(false);

  // ---- Branching (consent on page 1, role on page 2)
  consent.setChoices([consent.createChoice('Yes, I agree', FormApp.PageNavigationType.CONTINUE),
                      consent.createChoice('No', FormApp.PageNavigationType.SUBMIT)]);
  role.setChoices([role.createChoice(FACULTY, pProfile), role.createChoice(REVIEWER, pReviewer)]);

  // ---- Linked results sheet + summary tab + auto-update on every submission
  const ss = SpreadsheetApp.create('Activity Report Tool — Pilot Feedback (results)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  ss.insertSheet('Impact Summary');
  PropertiesService.getScriptProperties().setProperties({ formId: form.getId(), sheetId: ss.getId() });
  ScriptApp.newTrigger('updateImpactSummary').forSpreadsheet(ss).onFormSubmit().create();
  updateImpactSummary();

  Logger.log('Form (send this): ' + form.getPublishedUrl());
  Logger.log('Form (edit):      ' + form.getEditUrl());
  Logger.log('Results sheet:    ' + ss.getUrl());
}

/* --------------------------------------------------------------- summary */
function updateImpactSummary() {
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('sheetId'));
  const resp = ss.getSheets().find((s) => s.getFormUrl());
  const out = ss.getSheetByName('Impact Summary') || ss.insertSheet('Impact Summary');
  const data = resp ? resp.getDataRange().getValues() : [[]];
  const head = data[0].map(String);
  const rows = data.slice(1).filter((r) => r.some((c) => c !== ''));
  const col = (title) => head.indexOf(title);
  const get = (r, title) => { const i = col(title); return i < 0 ? '' : r[i]; };
  const numv = (r, title) => { const v = get(r, title); return v === '' || isNaN(Number(v)) ? null : Number(v); };
  const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const pct = (k, n) => (n ? Math.round((100 * k) / n) + '%' : '—');
  const r1 = (x) => (x == null ? '—' : Math.round(x * 10) / 10);

  const fac = rows.filter((r) => get(r, Q.role) === FACULTY);
  const rev = rows.filter((r) => get(r, Q.role) === REVIEWER);
  const n = fac.length;

  // time: only people who gave both times
  const pairs = fac.map((r) => [numv(r, Q.manualMin), numv(r, Q.appMin), get(r, Q.manualHow), get(r, Q.appHow)])
    .filter((p) => p[0] > 0 && p[1] > 0);
  const manMed = median(pairs.map((p) => p[0]));
  const appMed = median(pairs.map((p) => p[1]));
  const cutMed = manMed ? 1 - appMed / manMed : null;
  const perPersonCut = median(pairs.map((p) => 1 - p[1] / p[0]));
  const timed = pairs.filter((p) => p[2] === HOW[0] && p[3] === HOW[0]).length;
  const reports = fac.reduce((s, r) => s + (numv(r, Q.appReports) || 0), 0);
  const completed = fac.filter((r) => get(r, Q.completed) === 'Yes').length;

  const noEdit = fac.filter((r) => ['90–100%', '75–89%'].includes(get(r, Q.noEdit))).length;
  const noEdit90 = fac.filter((r) => get(r, Q.noEdit) === '90–100%').length;
  const caught = fac.filter((r) => get(r, Q.caught) === 'Yes').length;
  const caughtN = fac.reduce((s, r) => s + (numv(r, Q.caughtN) || 0), 0);
  const wrong = fac.filter((r) => get(r, Q.wrong) === 'Yes').length;
  const trust = mean(fac.map((r) => numv(r, Q.trust)).filter((x) => x != null));

  // SUS: odd items (score − 1), even items (5 − score), sum × 2.5 → 0–100
  const susScores = fac.map((r) => {
    const v = SUS.map((s) => Number(get(r, `${Q.sus} [${s}]`)));
    if (v.some((x) => !(x >= 1 && x <= 5))) return null;
    return 2.5 * v.reduce((s, x, i) => s + (i % 2 === 0 ? x - 1 : 5 - x), 0);
  }).filter((x) => x != null);
  const sus = mean(susScores);

  const npsV = fac.map((r) => numv(r, Q.nps)).filter((x) => x != null);
  const nps = npsV.length ? Math.round((100 * (npsV.filter((x) => x >= 9).length - npsV.filter((x) => x <= 6).length)) / npsV.length) : null;
  const next = fac.filter((r) => ['Definitely', 'Probably'].includes(get(r, Q.next))).length;
  const adopt = fac.filter((r) => String(get(r, Q.adopt)).startsWith('Yes')).length;
  const drafted = fac.filter((r) => !['', 'Did not use'].includes(get(r, Q.draft)));
  const draftOk = drafted.filter((r) => ['No edits', 'Minor edits'].includes(get(r, Q.draft))).length;

  const feat = FEATURES.map((f) => {
    const v = fac.map((r) => get(r, `${Q.features} [${f}]`)).filter((x) => x !== '' && x !== 'Not used').map(Number);
    return [f, r1(mean(v)), v.length];
  }).sort((a, b) => (b[1] === '—' ? -1 : b[1]) - (a[1] === '—' ? -1 : a[1]));

  const hQual = mean(rev.map((r) => numv(r, Q.hQuality)).filter((x) => x != null));
  const hAdopt = rev.filter((r) => String(get(r, Q.hDecision)).startsWith('Adopt')).length;
  const hLess = rev.filter((r) => ['Much less', 'Less'].includes(get(r, Q.hTime))).length;

  const table = [
    ['Metric', 'Value', 'Notes'],
    ['Faculty responses (n)', n, 'Small sample: always write n next to a result'],
    ['HoD / IQAC responses', rev.length, ''],
    ['Reports prepared in the app', reports, 'Self-reported; cross-check with the app’s /pilot page'],
    ['Completed a report up to approval', `${completed}/${n} (${pct(completed, n)})`, ''],
    ['TIME — median manual (min)', r1(manMed), `${pairs.length} people gave both times`],
    ['TIME — median with app (min)', r1(appMed), ''],
    ['TIME — reduction (median vs median)', cutMed == null ? '—' : pct(Math.round(cutMed * 100), 100), 'Headline time figure'],
    ['TIME — median per-person reduction', perPersonCut == null ? '—' : pct(Math.round(perPersonCut * 100), 100), 'Robust check of the headline'],
    ['TIME — both times measured with a clock', `${timed}/${pairs.length}`, 'Higher = more credible; say "measured" only if all timed'],
    ['Fields correct without edit ≥75%', `${noEdit}/${n} (${pct(noEdit, n)})`, `90–100%: ${noEdit90}/${n}`],
    ['Caught an issue they might have missed', `${caught}/${n} (${pct(caught, n)})`, `~${caughtN} issues flagged in total`],
    ['Wrong value reached a report unnoticed', `${wrong}/${n}`, 'Must be 0 to claim "no errors reached reports"'],
    ['Trust in values (1–5)', r1(trust), ''],
    ['SUS usability score (0–100)', r1(sus), '≥68 above average; ≥80 excellent'],
    ['NPS (−100 to +100)', nps == null ? '—' : nps, '% promoters (9–10) − % detractors (0–6)'],
    ['Would use it for the next report', `${next}/${n} (${pct(next, n)})`, 'Definitely + Probably'],
    ['Want department-wide use', `${adopt}/${n} (${pct(adopt, n)})`, 'Includes "after improvements"'],
    ['AI drafts needing no/minor edits', `${draftOk}/${drafted.length}`, 'Among people who used drafts'],
    ['HoD/IQAC: quality vs manual (1–5)', r1(hQual), ''],
    ['HoD/IQAC: less review time', `${hLess}/${rev.length}`, ''],
    ['HoD/IQAC: recommend adoption', `${hAdopt}/${rev.length}`, 'Adopt now or after improvements'],
    ['', '', ''],
    ['Feature usefulness (avg 1–5, users only)', '', ''],
    ...feat.map(([f, v, k]) => ['  ' + f, v, `${k} rated`]),
    ['', '', ''],
    ['CV-READY LINES (only measured numbers; check n before using)', '', ''],
  ];
  if (pairs.length) table.push([`Piloted with ${n} faculty: median report time ${r1(manMed)}→${r1(appMed)} min (${Math.round(cutMed * 100)}% faster, n=${pairs.length})`, '', timed === pairs.length ? 'all times clock-measured' : 'say "reported", not "measured"']);
  if (sus != null && nps != null) table.push([`Rated ${r1(sus)}/100 on SUS usability and NPS ${nps > 0 ? '+' : ''}${nps} by ${n} pilot faculty; ${next}/${n} would use it again`, '', '']);
  if (n) table.push([`${caught}/${n} faculty said it caught issues they would have missed; ${wrong} wrong values reached a report`, '', wrong ? 'not a strength yet' : '']);
  if (rev.length) table.push([`HoD/IQAC rated pilot reports ${r1(hQual)}/5 vs manual; ${hAdopt}/${rev.length} recommended department adoption`, '', '']);

  out.clear();
  out.getRange(1, 1, table.length, 3).setValues(table.map((r) => [r[0], r[1], r[2]]));
  out.getRange(1, 1, 1, 3).setFontWeight('bold');
  out.setColumnWidth(1, 520).setColumnWidth(2, 140).setColumnWidth(3, 380);
  out.getRange(1, 1, table.length, 3).setWrap(true);
}
