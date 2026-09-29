import type { TemplateDefinition } from "./schema";

/**
 * Pilot template for K.D.K. College of Engineering, Nagpur — Department of
 * Mechanical Engineering.
 *
 * Structure, labels and wording are copied from the two reference activity
 * packets supplied in reference-data/ (two different event types, session
 * 2024-25). Letterhead lines are the department letterhead printed on those
 * documents.
 *
 * Nothing event-specific lives here. Signatory names are per-activity fields
 * and start empty — they are not copied from the reference documents because
 * office holders change.
 */
export const KDK_MECH_V1: TemplateDefinition = {
  institution: {
    name: "KDK College of Engineering, Nagpur",
    department: "Mechanical Engineering",
  },
  dateFormat: "DD/MM/YYYY",
  fields: [
    { key: "session", label: "Session", type: "text", required: true, group: "details", aliases: ["Session"], help: "Academic session as printed on the report, e.g. 2024-25." },
    { key: "category", label: "Category of the Activity", type: "text", required: true, group: "details", aliases: ["Category of the Activity", "Category of Activity"] },
    { key: "title", label: "Title of the Activity", type: "text", required: true, group: "details", aliases: ["Title of the Activity", "Title of Activity"] },
    { key: "coordinator", label: "Coordinator", type: "text", required: true, group: "details", aliases: ["Coordinator", "Co-ordinator"] },
    { key: "activity_date", label: "Date of Activity", type: "date", required: true, group: "details", aliases: ["Date of Activity"] },
    { key: "activity_time", label: "Time", type: "time", required: false, group: "details", aliases: [] },
    { key: "venue", label: "Venue", type: "text", required: false, group: "details", aliases: ["Venue"] },
    { key: "male_count", label: "Male students", type: "integer", required: false, group: "participants", aliases: [] },
    { key: "female_count", label: "Female students", type: "integer", required: false, group: "participants", aliases: [] },
    { key: "total_count", label: "Total students", type: "integer", required: true, group: "participants", aliases: [] },
    { key: "association", label: "Association/Collaboration", type: "text", required: false, group: "details", aliases: ["Association/Collaboration", "Association / Collaboration"] },
    { key: "invited_speaker", label: "Details of Invited Speaker", type: "text", required: false, group: "details", aliases: ["Details of Invited Speaker"] },
    { key: "brief", label: "Brief about an Activity", type: "longtext", required: true, group: "narrative", aliases: ["Brief about an Activity", "Brief about Activity"] },
    { key: "objectives", label: "Objectives", type: "longtext", required: true, group: "narrative", aliases: ["Objectives"] },
    { key: "outcomes", label: "Outcomes", type: "longtext", required: true, group: "narrative", aliases: ["Outcomes"] },
    { key: "event_description", label: "Event description (detailed report)", type: "longtext", required: false, group: "narrative", aliases: [], help: "Body of the detailed REPORT. If left empty, a draft is assembled only from other fields." },
    { key: "impact_analysis", label: "Impact Analysis (detailed report)", type: "longtext", required: false, group: "narrative", aliases: ["Impact Analysis"], help: "If left empty, the Outcomes text is reused verbatim." },
    { key: "notice_date", label: "Notice issue date", type: "date", required: false, group: "other", aliases: [], help: "Date printed on the notice header. This is not the activity date." },
    { key: "report_date", label: "Detailed report date", type: "date", required: false, group: "other", aliases: [] },
    { key: "hod_name", label: "HoD / Committee Incharge (name)", type: "text", required: false, group: "signatories", aliases: [] },
    { key: "iqac_coordinator_name", label: "IQAC Coordinator (name)", type: "text", required: false, group: "signatories", aliases: [] },
    { key: "principal_name", label: "Principal (name)", type: "text", required: false, group: "signatories", aliases: [] },
  ],
  activityReport: {
    titleLines: ["{institution.name}", "Activity Report", "Session: {session}", "Department of {institution.department}"],
    heading: "Activity Report",
    detailRows: [
      { label: "Category of the Activity:", value: "{category}" },
      { label: "Title of the Activity", value: "{title}" },
      { label: "Coordinator", value: "{coordinator}" },
      { label: "Date of Activity", value: "{activity_date}  Time: {activity_time}" },
      { label: "No. of Students Involved:", value: "Male: {male_count}    Female: {female_count}    Total: {total_count}" },
      { label: "Association/Collaboration", value: "{association}" },
      { label: "Details of Invited Speaker", value: "{invited_speaker}" },
    ],
    narrativeRows: [
      { label: "Brief about an Activity", value: "{brief}" },
      { label: "Objectives", value: "{objectives}" },
      { label: "Outcomes", value: "{outcomes}" },
    ],
    signatories: [
      { heading: "Faculty Coordinator", lines: ["{coordinator}", "Name & Signature of Co-ordinator"] },
      { heading: "HoD/ Committee Incharge", lines: ["{hod_name}", "Name & Signature of HOD"] },
      { heading: "IQAC Coordinator", lines: ["{iqac_coordinator_name}", "IQAC Coordinator"] },
      { heading: "Principal", lines: ["{principal_name}", "Principal"] },
    ],
  },
  detailedReport: {
    letterheadLines: [
      "DEPARTMENT OF MECHANICAL ENGINEERING",
      "K.D.K. COLLEGE OF ENGINEERING",
      "Great Nag Road, Nandanvan, Nagpur-9",
      "Ext.: 208, Tel.: 0712-2712538",
      "www.kdkce.edu",
    ],
    dateLine: "Date:- {report_date}",
    heading: "REPORT",
    topicLabel: "Topic-",
    topicField: "title",
    descriptionField: "event_description",
    impactHeading: "Impact Analysis:",
    impactField: "impact_analysis",
    descriptionDraft: {
      intro: "The Department of {institution.department} has organised {title} at {venue} on {activity_date} at {activity_time}.",
      appendFields: ["objectives"],
    },
    impactDraftFields: ["outcomes"],
    signatories: [
      { heading: "", lines: ["{coordinator}", "Co-ordinator", "{institution.department} Department"] },
      { heading: "", lines: ["{hod_name}", "Head", "{institution.department} Department"] },
    ],
  },
  attendance: {
    heading: "List of Participants (With Attendance)",
    maleField: "male_count",
    femaleField: "female_count",
    totalField: "total_count",
  },
  packet: {
    sections: [
      { include: "poster" },
      { include: "notice" },
      { include: "generated_activity_report" },
      { include: "generated_detailed_report" },
      { include: "attendance", heading: "List of Participants (With Attendance)" },
      { include: "photo", heading: "Photograph" },
      { include: "supporting" },
    ],
  },
  sourcePriority: ["activity_report", "detailed_report", "notice", "attendance", "poster", "supporting", "photo"],
};
