import xlsx from 'xlsx';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const workbookPath = process.argv[2];
if (!workbookPath) throw new Error('Usage: tsx scripts/import-workbook.ts <workbook.xlsx>');
const workbook = xlsx.readFile(workbookPath, { cellDates: true });
const rows = (sheet: string) => xlsx.utils.sheet_to_json<any[]>(workbook.Sheets[sheet], { header: 1, defval: null, raw: false });
const text = (value: unknown) => value == null || String(value).trim() === '' ? null : String(value).trim();
const date = (value: unknown) => {
  const valueText = text(value);
  if (!valueText || ['N/A', '-', 'TBD'].includes(valueText)) return null;
  const parsed = new Date(valueText);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};
const status = (value: unknown) => {
  const normalized = text(value)?.toLowerCase();
  if (!normalized || normalized === 'to do') return 'Todo';
  if (normalized === 'done') return 'Done';
  if (normalized === 'deferred') return 'Deferred';
  if (normalized.includes('at risk')) return 'In Progress – At Risk';
  if (normalized === 'in progress') return 'In Progress';
  return 'Todo';
};
const report = { documents: 0, opirActions: 0, auditFindings: 0, objectives: 0, okrTasks: 0, initiatives: 0, subInitiatives: 0 };

async function documents() {
  const statusMap: Record<string, string> = { 'to decommision': 'For Decommissioning', 'updated': 'Updated', 'non existent': 'Non-existent' };
  const pillarMap: Record<string, string> = { 'not csec': 'Not Cybersecurity' };
  for (const row of rows('Tracker').slice(1).filter(row => text(row[0]))) {
    const rawStatus = text(row[1])?.toLowerCase() || '';
    const rawPillar = text(row[2])?.toLowerCase() || '';
    await db.governanceDocument.upsert({ where: { documentName: text(row[0])! }, update: {
      status: statusMap[rawStatus] || text(row[1])!, cybersecurityPillar: pillarMap[rawPillar] || text(row[2])!, commentsRemarks: text(row[3]), applicableStandards: text(row[4]), applicableBspRegulations: text(row[5])
    }, create: { documentName: text(row[0])!, status: statusMap[rawStatus] || text(row[1])!, cybersecurityPillar: pillarMap[rawPillar] || text(row[2])!, commentsRemarks: text(row[3]), applicableStandards: text(row[4]), applicableBspRegulations: text(row[5]) } });
    report.documents++;
  }
}

async function opir() {
  const noTcd = rows('No TCD OPIR').slice(2).filter(row => text(row[0]));
  const overdue = rows('Overdue OPIR').slice(2).filter(row => text(row[2]));
  for (const row of noTcd) {
    const matching = overdue.find(candidate => text(candidate[4]) === text(row[4]) && text(candidate[2]) === text(row[2]));
    const daysPast = matching ? Number(matching[5]) : 0;
    const target = matching && Number.isFinite(daysPast) ? new Date(Date.UTC(2026, 6, 15 - daysPast)) : null;
    const jira = text(row[7]);
    const actionStatus = /in progress/i.test(jira || '') ? 'In Progress' : /to do/i.test(jira || '') ? 'Todo' : 'Todo';
    const data = { squad: text(matching?.[0]) || 'Cybersecurity', riskRating: text(row[1]) || 'Unrated', incidentTitle: text(row[2])!, actionOwner: text(row[3]), solution: text(row[4]), originalTargetDate: target, updatedTargetDate: null, remarks: text(matching?.[6]) || text(row[6]), jiraTicket: jira, actionStatus, lastUpdateDate: new Date('2026-07-15T00:00:00Z') };
    await db.opirAction.upsert({ where: { opirNumber: String(row[0]) }, update: data, create: { opirNumber: String(row[0]), ...data } });
    report.opirActions++;
  }
}

async function audits() {
  const first = rows('Audit Finding - 1').slice(1).filter(row => text(row[0]));
  const seenTitles = new Set<string>();
  for (const row of first) {
    const title = text(row[6])!; seenTitles.add(title.toLowerCase());
    const data = { year: Number(row[1]) || null, observationId: text(row[2]), division: text(row[3]), departmentProcess: text(row[5]), auditObservation: title, observationDetails: text(row[7]), riskLevel: text(row[8]) || 'Unrated', rootCause: text(row[9]), risks: text(row[10]), impact: text(row[11]), recommendation: text(row[12]), managementResponse: text(row[13]), commitmentActionPlan: null, responsibleDepartment: text(row[3]), responsiblePersonnel: text(row[14]), reportDate: date(row[4]), exitMeetingDate: date(row[17]), originalTargetDate: date(row[16]), updatedTargetDate: date(row[18]), managementStatus: text(row[19]), findingStatus: /closed/i.test(text(row[19]) || '') ? 'Closed' : 'Open', remarks: [text(row[20]), text(row[21])].filter(Boolean).join('\n\n') || null };
    await db.auditFinding.upsert({ where: { findingNumber: String(row[0]) }, update: data, create: { findingNumber: String(row[0]), ...data } }); report.auditFindings++;
  }
  for (const row of rows('Audit Finding - 2').slice(1).filter(row => text(row[0]) && text(row[3]))) {
    if (seenTitles.has(text(row[3])!.toLowerCase())) continue;
    const data = { year: date(row[9])?.getFullYear() || null, observationId: null, division: text(row[1]), departmentProcess: text(row[2]), auditObservation: text(row[3])!, observationDetails: text(row[4]), riskLevel: text(row[5]) || 'Unrated', rootCause: text(row[13]), risks: text(row[14]), impact: text(row[15]), recommendation: text(row[6]), managementResponse: text(row[7]), commitmentActionPlan: text(row[8]), responsibleDepartment: text(row[16]), responsiblePersonnel: text(row[17]), reportDate: date(row[9]), exitMeetingDate: date(row[10]), originalTargetDate: date(row[11]), updatedTargetDate: date(row[12]), managementStatus: text(row[18]), findingStatus: /closed/i.test(text(row[24]) || '') ? 'Closed' : 'Open', remarks: text(row[19]) };
    await db.auditFinding.upsert({ where: { findingNumber: String(row[0]) }, update: data, create: { findingNumber: String(row[0]), ...data } }); report.auditFindings++;
  }
}

async function okrsAndInitiatives() {
  const data = rows('Governance Duties');
  const usedIds = new Map<string, number>();
  let objective: { id: number } | null = null;
  for (let i = 2; i < 41; i++) {
    const row = data[i]; if (!row) continue;
    if (text(row[1])) {
      const original = text(row[3]) || `OBJ-ROW-${i + 1}`; const occurrence = (usedIds.get(original) || 0) + 1; usedIds.set(original, occurrence);
      const objectiveId = occurrence === 1 ? original : `${original}-${occurrence}`;
      objective = await db.objective.upsert({ where: { objectiveId }, update: { objectiveName: text(row[1])!, objectiveStatus: status(row[7]), assignees: text(row[8]), contributors: text(row[9]), startDate: date(row[10]), endDate: date(row[11]) }, create: { objectiveId, objectiveName: text(row[1])!, objectiveStatus: status(row[7]), assignees: text(row[8]), contributors: text(row[9]), startDate: date(row[10]), endDate: date(row[11]) } }); report.objectives++;
      await db.okrTask.deleteMany({ where: { objectiveId: objective.id } });
    } else if (objective && text(row[2])) {
      await db.okrTask.create({ data: { objectiveId: objective.id, taskName: text(row[2])!, taskStatus: status(row[7]), assignees: text(row[8]), contributors: text(row[9]), startDate: date(row[10]), endDate: date(row[11]) } }); report.okrTasks++;
    }
  }
  let category = 'Uncategorized'; let initiative: { id: number } | null = null;
  for (let i = 43; i < data.length; i++) {
    const row = data[i]; if (!row) continue;
    if (text(row[0])) category = text(row[0])!;
    if (text(row[1])) {
      const name = text(row[1])!;
      initiative = await db.initiative.findFirst({ where: { category, initiativeName: name } }) || await db.initiative.create({ data: { category, initiativeName: name, status: 'Todo' } });
      await db.initiative.update({ where: { id: initiative.id }, data: { archivedAt: null } });
      await db.subInitiative.deleteMany({ where: { initiativeId: initiative.id } }); report.initiatives++;
    } else if (initiative && text(row[2])) {
      await db.subInitiative.create({ data: { initiativeId: initiative.id, subInitiativeName: text(row[2])!, status: status(row[3]) } }); report.subInitiatives++;
    }
  }
}

async function main() {
  await documents();
  await opir();
  await audits();
  await okrsAndInitiatives();
  await db.activityLog.deleteMany({ where: { entityType: 'WorkbookMigration', entityId: 'Governance Dashboard (2).xlsx' } });
  await db.activityLog.create({ data: { entityType: 'WorkbookMigration', entityId: 'Governance Dashboard (2).xlsx', action: 'Imported', newValue: JSON.stringify(report) } });
  console.log(JSON.stringify(report, null, 2));
}
main().finally(() => db.$disconnect());
