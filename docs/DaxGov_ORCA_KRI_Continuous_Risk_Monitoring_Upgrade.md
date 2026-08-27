# DaxGov ORCA ↔ KRI Continuous Risk Monitoring Upgrade
## Cursor Implementation Specification

## 1. Objective

Upgrade the existing DaxGov ORCA and KRI workflow from a simple manual mapping relationship into a continuous cyber risk monitoring workflow.

The target operational model is:

```text
ORCA Risk
   ↓
Monitoring Requirement
   ↓
KRI Assignment / Creation
   ↓
Periodic KRI Submission
   ↓
Automatic Threshold Evaluation
   ↓
Good / Warning / Breached
   ↓
If Breached → ORCA Risk Review Required
   ↓
Risk Decision / Treatment / Action
   ↓
Audit Trail
   ↓
Continuous Monitoring
```

The purpose of this upgrade is to make the statement:

> "KRIs monitor ORCA risks"

true operationally in DaxGov, rather than only through a many-to-many mapping table.

---

# 2. Existing Application Context

DaxGov currently uses:

- React client
- Express API
- Prisma
- SQLite
- Existing database: `prisma/governance.db`

Existing ORCA implementation:

- Route: `/orca`
- Client:
  - `client/src/OrcaPage.tsx`
  - `client/src/RegisterPage.tsx`
- Server:
  - `server/orca.ts`
  - `server/orcaAssessmentSeed.json`
  - ORCA routes in `server/app.ts`

Existing KRI implementation:

- Route: `/kris`
- Client:
  - `client/src/KriPage.tsx`
  - `client/src/OrcaKriMapping.tsx`
- Server:
  - `server/kris.ts`
  - `server/kriSeed.json`

Existing supporting components:

- Notifications: `server/notifications.ts`
- Information Asset ORCA research: `server/informationAssets.ts`
- Tests:
  - `tests/orca.test.ts`
  - `tests/kri.test.ts`
  - `tests/notifications.test.ts`
  - `tests/auth.test.ts`

Existing relevant models:

- `OrcaRisk`
- `KriSheet`
- `KriRecord`
- `KriOrcaMap`

Do not replace SQLite as part of this implementation.

Do not remove existing ORCA history, KRI history, year sheets, archives, or existing mappings.

Backward compatibility is required.

---

# 3. Current Workflow Problems to Solve

The current implementation has several workflow gaps.

## 3.1 Mapping is passive

ORCA and KRIs can be manually mapped, but the relationship does not drive risk-management behavior.

A breached KRI currently does not automatically place the mapped ORCA risk into a review workflow.

## 3.2 KRI results are manually classified

Monthly KRI results are entered as:

- Good
- Warning
- Breached

Thresholds are stored mainly as text.

Users should instead enter the actual result and DaxGov should calculate the status.

## 3.3 No formal KRI monitoring requirement exists in ORCA

There is no field identifying:

- whether the risk requires KRI monitoring
- why monitoring is required
- whether the risk is adequately monitored
- who owns the monitoring
- how often the risk should be monitored

## 3.4 No monitoring coverage workflow

There is no management view showing:

- ORCA risks requiring KRIs
- ORCA risks that are covered
- ORCA risks that are partially covered
- ORCA risks requiring KRIs but currently unmapped
- ORCA risks where monitoring is intentionally not required

## 3.5 No mandatory risk review after KRI breach

A KRI breach should create a documented risk-management decision.

DaxGov must NOT automatically change residual risk ratings.

Instead, the application should require a human review.

## 3.6 No management dashboard for ORCA/KRI monitoring

The existing dashboard does not provide ORCA/KRI management metrics.

## 3.7 Missing KRI submission workflow

Blank monthly KRI results are currently possible without a meaningful status such as Due or Overdue.

## 3.8 Weight is not operationally used

KRI weight exists but is not currently used for portfolio scoring.

Do not implement a complex portfolio scoring model in the first phase.

---

# 4. Design Principles

Follow these principles throughout the implementation.

## 4.1 Preserve ORCA and KRI as separate registers

Do not merge ORCA and KRI into one table or one page.

ORCA remains the risk register.

KRI remains the monitoring register.

Their relationship should become operationally stronger.

## 4.2 Never automatically modify risk ratings because of a KRI breach

A KRI breach may trigger:

- review
- escalation
- treatment
- action
- risk acceptance

But residual likelihood and residual impact must only change through an authorized user action.

## 4.3 Preserve historical KRI data

Do not alter historical monthly results when implementing structured thresholds.

Legacy records must remain viewable.

## 4.4 Maintain Admin/User page grants

Do not bypass the existing DaxGov authorization model.

Existing page permissions must remain enforced.

## 4.5 Use real backend validation

Do not rely only on React controls.

Validate important enums, thresholds, values, and state transitions server-side.

## 4.6 Add functionality incrementally

Implement in iterations.

Each iteration should leave DaxGov runnable.

Avoid one massive refactor.

---

# 5. Target ORCA Workflow

Upgrade ORCA so each risk can explicitly define its monitoring requirement.

Add the following conceptual fields to each ORCA risk.

## 5.1 New ORCA monitoring fields

### `kriMonitoringRequired`

Type:

```ts
boolean | null
```

Meaning:

- `true` = risk requires active KRI monitoring
- `false` = KRI monitoring is not required
- `null` = not yet assessed

### `monitoringRationale`

Type:

```ts
string | null
```

Required when:

```text
kriMonitoringRequired = false
```

Recommended when:

```text
kriMonitoringRequired = true
```

### `monitoringFrequency`

Allowed values:

```text
Monthly
Quarterly
EventDriven
NotApplicable
```

### `monitoringOwner`

Initially implement as a text value unless a safe existing user foreign-key relationship is already available.

Do not force a user FK refactor during the first implementation.

### `nextMonitoringReviewDate`

Nullable date.

### `monitoringStatus`

Prefer calculating this dynamically rather than trusting a manually editable field.

Possible UI values:

```text
Not Assessed
Not Required
Unmapped
Partially Covered
Covered
Review Required
```

Do not expose `monitoringStatus` as a manually editable dropdown.

---

# 6. ORCA Monitoring Status Logic

Implement a reusable backend/service function such as:

```ts
getOrcaMonitoringStatus(risk)
```

Suggested rules:

```text
IF kriMonitoringRequired IS NULL
    → Not Assessed

IF kriMonitoringRequired = false
    → Not Required

IF kriMonitoringRequired = true
AND active mapped KRI count = 0
    → Unmapped

IF kriMonitoringRequired = true
AND active mapped KRI count > 0
AND there is an unresolved KRI-triggered risk review
    → Review Required

IF kriMonitoringRequired = true
AND active mapped KRI count > 0
AND one or more required monitoring conditions are incomplete
    → Partially Covered

OTHERWISE
    → Covered
```

For the first implementation, "Partially Covered" can be limited to simple logic such as:

- mapped KRI exists but is archived
- mapped KRI has no valid threshold configuration
- mapped KRI has no owner or monitoring frequency

Do not over-engineer coverage completeness initially.

---

# 7. ORCA UI Changes

## 7.1 ORCA table

Add columns:

- KRI Required
- KRI Coverage
- Latest KRI Status
- Risk Review

Suggested badges:

```text
Covered                    → Green
Partially Covered          → Amber
Monitoring Required-No KRI → Red
Not Required               → Gray
Review Required            → Red
Not Assessed               → Gray/Blue
```

## 7.2 Filters

Add filters:

```text
KRI Monitoring Required
KRI Coverage
Risk Review Status
Latest KRI Status
```

## 7.3 ORCA expanded row / drawer

Refactor or extend the ORCA detail UI to support tabs:

```text
Overview
Controls
Treatment
KRIs
Actions
History
```

Do not remove existing ORCA data.

### KRIs tab

Display all KRIs mapped to the selected ORCA risk.

Columns:

```text
KRI Number
Indicator
Owner
Frequency
Current Period
Actual Result
RAG Status
Trend
Submission Status
```

Show the last 6 months if practical.

Example:

| KRI | Jul | Aug | Trend |
|---|---|---|---|
| Offboarding Exceptions | 0 Good | 3 Breached | Deteriorating |
| Access Removal SLA | 98% Good | 92% Warning | Watch |

If any mapped KRI has an unresolved breach-triggered review:

show:

```text
KRI BREACH — RISK REVIEW REQUIRED
```

and a CTA:

```text
Complete Risk Review
```

---

# 8. Upgrade KRI Definition

The current KRI model supports basic indicator fields, free-text thresholds, monthly status, and remarks.

Extend it to support structured KRI calculation.

## 8.1 New KRI fields

Add:

### `unit`

Suggested values:

```text
Percentage
Count
Days
Hours
Currency
Score
Custom
```

### `direction`

Allowed values:

```text
HIGHER_IS_BETTER
LOWER_IS_BETTER
```

### `frequency`

Allowed values:

```text
MONTHLY
QUARTERLY
EVENT_DRIVEN
```

### `dataSource`

String.

Examples:

```text
Qualys
Jira
IAM reconciliation
MSOC tickets
Manual evidence
```

### `owner`

Initially text unless existing user relationships can be safely reused.

### Structured thresholds

Recommended design:

```ts
goodOperator
goodValue
warningOperator
warningValue
breachOperator
breachValue
```

However, because threshold bands can be ranges, a more flexible approach is recommended.

Add:

```ts
thresholdMode
```

Allowed initial values:

```text
HIGHER_IS_BETTER
LOWER_IS_BETTER
MANUAL
```

Add numeric fields:

```ts
goodThreshold
warningThreshold
```

Interpretation:

## HIGHER_IS_BETTER

Example:

```text
Good >= 95
Warning >= 85 and < 95
Breached < 85
```

Stored as:

```text
goodThreshold = 95
warningThreshold = 85
```

## LOWER_IS_BETTER

Example:

```text
Good <= 0
Warning <= 1
Breached > 1
```

This specific example reveals that two-value threshold storage can become ambiguous.

Therefore, use the following safer schema instead.

---

# 9. Recommended Threshold Model

Add a new model:

```prisma
model KriThreshold {
  id          Int      @id @default(autoincrement())
  kriRecordId Int      @unique
  kriRecord   KriRecord @relation(fields: [kriRecordId], references: [id], onDelete: Cascade)

  mode        String
  goodMin     Float?
  goodMax     Float?
  warningMin  Float?
  warningMax  Float?
  breachMin   Float?
  breachMax   Float?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

Interpret each status as inclusive numeric boundaries.

Examples:

### Critical patching success

```text
Good:
goodMin = 95
goodMax = null

Warning:
warningMin = 85
warningMax = 94.999

Breached:
breachMin = null
breachMax = 84.999
```

### Offboarding exception count

```text
Good:
goodMin = 0
goodMax = 0

Warning:
warningMin = 1
warningMax = 1

Breached:
breachMin = 2
breachMax = null
```

Create a reusable function:

```ts
evaluateKriResult(actualValue, threshold): "Good" | "Warning" | "Breached"
```

Server-side evaluation is mandatory.

---

# 10. Monthly KRI Result Redesign

The current KRI schema appears to store month-specific result and remarks columns.

For minimum-risk implementation, it is acceptable to retain the current structure temporarily.

However, for long-term maintainability, migrate monthly submissions to a separate normalized model.

Recommended new model:

```prisma
model KriSubmission {
  id           Int       @id @default(autoincrement())
  kriRecordId  Int
  kriRecord    KriRecord @relation(fields: [kriRecordId], references: [id], onDelete: Cascade)

  year         Int
  month        Int

  actualValue  Float?
  status       String?
  remarks      String?
  evidenceLink String?

  submittedBy  String?
  submittedAt  DateTime?

  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@unique([kriRecordId, year, month])
}
```

If replacing the existing monthly column model is too risky for the current codebase:

### Phase 1

Keep existing monthly fields and add parallel actual-value fields.

### Phase 2

Normalize to `KriSubmission`.

Cursor should inspect the current Prisma schema before choosing the migration strategy.

Prefer backward-compatible migration over destructive migration.

---

# 11. Monthly KRI Submission Workflow

Replace the primary user action:

```text
Select Good / Warning / Breached
```

with:

```text
Enter Actual Result
```

Then:

```text
DaxGov calculates the result
```

Example:

```text
KRI:
Critical Vulnerability Remediation SLA

Actual Result:
91.4%

Threshold:
Good >= 95
Warning 85–94.99
Breached < 85

Calculated:
WARNING
```

The user must not manually override the calculated status unless:

```text
thresholdMode = MANUAL
```

If manual mode remains supported, require remarks.

---

# 12. KRI Submission Status

Each expected monitoring period should expose a submission state.

Suggested states:

```text
NOT_DUE
DUE
SUBMITTED
OVERDUE
BREACHED
REVIEW_REQUIRED
```

Do not store redundant states if they can be derived reliably.

Suggested calculation:

```text
period in future
    → Not Due

period currently open and no submission
    → Due

past required period and no submission
    → Overdue

submission exists and result != Breached
    → Submitted

submission exists and result = Breached
    → Breached

submission exists
AND result = Breached
AND associated ORCA review remains unresolved
    → Review Required
```

---

# 13. KRI Definition Wizard

Change the Add KRI interface into a wizard.

## Step 1 — Select ORCA Risk(s)

Allow many-to-many mapping.

Display:

```text
Risk Number
Process
Threat/Risk description
Residual Risk Rating
Current Coverage
```

Allow multiple ORCA risks.

## Step 2 — Define KRI

Fields:

```text
KRI Number
Indicator
Owner
Frequency
Data Source
Weight
Unit
Direction
```

## Step 3 — Define Thresholds

UI should support:

```text
Good
Warning
Breached
```

Example:

```text
Good: >= 95%
Warning: 85%–94.99%
Breached: < 85%
```

Show an inline preview:

```text
Example Result: 91%
Calculated Status: WARNING
```

## Step 4 — Review

Show:

```text
Mapped Risks
Indicator
Frequency
Threshold
Owner
Data Source
```

Then save.

Saving should create/update the KRI and mapping transactionally where practical.

---

# 14. KRI Breach → ORCA Risk Review

This is the most important workflow change.

When a KRI submission evaluates to:

```text
Breached
```

DaxGov must:

1. Find all active ORCA risks mapped to that KRI.
2. Create a Risk Review Required record for each applicable ORCA risk.
3. Notify relevant watchers/users.
4. Display the review requirement in ORCA.
5. Record the event in activity history.

Do NOT automatically modify:

```text
Residual Likelihood
Residual Impact
Residual Score
Treatment Strategy
```

---

# 15. New ORCA Risk Review Model

Add a model similar to:

```prisma
model OrcaRiskReview {
  id              Int      @id @default(autoincrement())
  orcaRiskId      Int
  orcaRisk        OrcaRisk @relation(fields: [orcaRiskId], references: [id], onDelete: Cascade)

  kriRecordId     Int?
  kriSubmissionId Int?

  triggerType     String
  triggerDetails  String?

  status          String   @default("OPEN")

  decision        String?
  rationale       String?

  oldLikelihood   String?
  oldImpact       String?
  oldResidualScore Int?

  newLikelihood   String?
  newImpact       String?
  newResidualScore Int?

  reviewedBy      String?
  reviewedAt      DateTime?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

Suggested `triggerType` values:

```text
KRI_BREACH
REPEATED_KRI_BREACH
MANUAL_REVIEW
```

Suggested `status`:

```text
OPEN
COMPLETED
CANCELLED
```

Suggested decisions:

```text
NO_CHANGE
UPDATE_LIKELIHOOD
UPDATE_IMPACT
UPDATE_RISK_RATING
CREATE_ACTION
UPDATE_TREATMENT
ESCALATE
RISK_ACCEPTANCE
```

A review may involve more than one action.

If a single decision field becomes too restrictive, use:

```text
primaryDecision
```

plus action creation.

---

# 16. Risk Review UI

When a mapped KRI breaches, show:

```text
ORCA Risk Review Required
```

Display:

```text
Risk
KRI
Period
Actual Result
Threshold
Calculated KRI Status
Current Residual Rating
```

Require the reviewer to document:

```text
Decision
Rationale
Reviewer
Review Date
```

Possible decisions:

- No change to current risk assessment
- Update residual likelihood
- Update residual impact
- Update residual risk
- Create treatment action
- Escalate risk
- Initiate risk acceptance

If residual likelihood or impact changes:

reuse the existing ORCA rating calculation logic.

Do not duplicate scoring code.

---

# 17. Repeated Breach Escalation

Add simple escalation logic.

Initial recommended behavior:

## First breach

```text
Create ORCA Risk Review
Notify KRI owner / watchers
```

## Two consecutive breaches

```text
Display Escalation Warning
Notify ORCA watchers
```

## Three consecutive breaches

```text
Mandatory ORCA reassessment
Mark trigger as REPEATED_KRI_BREACH
```

If implementation complexity is high:

implement only first-breach behavior in Phase 1.

Add repeated-breach escalation in a later iteration.

---

# 18. KRI Coverage Workspace

Replace or complement the existing mapping modal with a dedicated management-oriented page.

Suggested route:

```text
/risk-monitoring
```

or:

```text
/kri-coverage
```

Do not remove the existing mapping component until the replacement is fully working.

## Summary cards

Display:

```text
Total ORCA Risks
KRI Monitoring Required
Covered
Partially Covered
Unmapped
Not Required
Review Required
```

## Coverage Table

Columns:

```text
Risk No.
Process
Risk
Residual Rating
KRI Required
Mapped KRIs
Coverage Status
Latest KRI Status
Risk Review
Actions
```

Example:

| Risk | Residual | KRI Required | KRI Count | Coverage |
|---|---|---|---|---|
| CYB-3-6 | High | Yes | 2 | Covered |
| CYB-1-1 | High | Yes | 1 | Covered |
| CYB-2-1 | Medium | Yes | 0 | No KRI |
| CYB-3-4 | Medium | No | 0 | Not Required |

Actions:

```text
Map KRI
Create KRI
Review Monitoring
Open ORCA
```

---

# 19. Management Dashboard

Add an ORCA/KRI management section to the DaxGov dashboard.

The dashboard should be useful during management or ManCom presentations.

Do not present invented real metrics.

All dashboard values must be calculated from application data.

## 19.1 Executive KPI Cards

Add:

```text
KRI Coverage %
Breached KRIs
High/Critical Residual Risks
Overdue KRI Submissions
Open KRI-Triggered Risk Reviews
```

### KRI Coverage formula

Recommended:

```text
Number of ORCA risks where:
kriMonitoringRequired = true
AND monitoringStatus in (Covered, Review Required)

DIVIDED BY

Number of ORCA risks where:
kriMonitoringRequired = true
```

Multiply by 100.

Do not include risks marked Not Required.

---

# 20. Risk Monitoring Effectiveness Score

Add an optional management-facing scale from:

```text
0–100
```

This is NOT an ORCA risk rating.

Label clearly:

```text
Risk Monitoring Effectiveness
```

Suggested initial formula:

```text
Coverage Score       = KRI coverage % × 0.40
Submission Score     = On-time KRI submission % × 0.25
Breach Resolution    = Resolved breach reviews % × 0.20
Critical Coverage    = High/Critical risks with active KRI coverage % × 0.15

Monitoring Effectiveness =
Coverage Score +
Submission Score +
Breach Resolution +
Critical Coverage
```

Scale:

```text
0–20   Critical
21–40  Weak
41–60  Watch
61–80  Good
81–100 Strong
```

Important:

Do not use this score to change ORCA residual risk.

This is a management monitoring-quality indicator only.

---

# 21. Dashboard Charts

Add presentation-friendly charts.

Prefer reusable existing chart components if DaxGov already has them.

If there is no chart library, inspect package dependencies before adding one.

If adding a dependency is needed, prefer a lightweight and well-maintained React chart library.

Recommended charts:

## 21.1 Residual Risk Distribution

Donut/pie chart:

```text
Critical
High
Medium
Low
```

Data source:

ORCA residual risk ratings.

## 21.2 KRI Health Distribution

Donut/pie chart:

```text
Good
Warning
Breached
Missing / Overdue
```

Use current monitoring period.

## 21.3 KRI Status Trend

6 or 12 month chart.

For each month:

```text
Good Count
Warning Count
Breached Count
```

Use stacked bars if supported.

## 21.4 KRI Coverage Trend

Line chart.

Show:

```text
% of KRI-required ORCA risks with active monitoring
```

If historical coverage snapshots do not exist:

do NOT fabricate historical values.

For Phase 1:

show current coverage only.

For Phase 2:

add monthly snapshots.

## 21.5 Management Attention

Present categorized counts:

```text
Normal
Watch
Management Attention
Unmonitored Exposure
```

Suggested logic:

### Normal

```text
Covered
No breach
No warning requiring action
```

### Watch

```text
Warning KRI
or deteriorating trend
```

### Management Attention

```text
Breached KRI mapped to High/Critical ORCA risk
or unresolved repeated breach
```

### Unmonitored Exposure

```text
kriMonitoringRequired = true
AND no active mapped KRI
```

---

# 22. Coverage History

To support a real coverage trend later, optionally add:

```prisma
model RiskMonitoringSnapshot {
  id                    Int      @id @default(autoincrement())
  snapshotDate          DateTime
  totalRisks             Int
  monitoringRequired     Int
  covered                Int
  partiallyCovered       Int
  unmapped                Int
  reviewRequired         Int
  coveragePercent        Float

  createdAt              DateTime @default(now())
}
```

Do NOT implement this before core monitoring workflow works.

This is a later-phase feature.

---

# 23. Notifications

Upgrade `server/notifications.ts`.

Existing notifications should continue to work.

Add events for:

```text
KRI submission due
KRI submission overdue
KRI warning
KRI breach
ORCA risk review required
Repeated KRI breach
Risk review overdue
```

Avoid notification spam.

For Phase 1:

prioritize:

```text
KRI breached
ORCA review required
KRI overdue
```

If the application already has watched/starred rows:

respect the existing watching model.

---

# 24. Activity Logging

Use the existing activity logging approach.

Log:

```text
KRI created
KRI thresholds changed
KRI mapped to ORCA
KRI submission added
KRI status calculated
KRI breach triggered
ORCA review created
ORCA review completed
Residual risk changed after review
Treatment action created from review
Monitoring requirement changed
```

Do not log sensitive evidence content unnecessarily.

---

# 25. Year-End KRI Workflow

Current year rollover behavior should remain supported.

Upgrade the user experience.

Instead of immediately copying everything blindly, introduce a review step.

When the user selects:

```text
Archive 2026 and Start 2027
```

show:

## Step 1 — Review KRIs

For each KRI:

```text
Carry Forward
Modify
Retire
Replace
```

## Step 2 — Review ORCA Mapping

Display mapped ORCA risks.

Allow adjustment.

## Step 3 — Confirm New Year

Copy:

```text
KRI definition
structured thresholds
ORCA mappings
owner
frequency
data source
weight
```

Do not copy:

```text
monthly submissions
remarks
evidence
breach review status
```

If this workflow is too large for the first iteration:

preserve current rollover and implement the review wizard later.

---

# 26. Permissions

Preserve current page grants:

```text
orca
kris
```

Recommended authorization:

## View coverage

Allow user if:

```text
Admin
OR has orca
OR has kris
```

## Edit ORCA monitoring requirement

Require:

```text
Admin
OR existing ORCA edit permission
```

## Define/edit KRI

Require:

```text
Admin
OR existing KRI edit permission
```

## Complete ORCA Risk Review

Initially require:

```text
Admin
OR ORCA edit permission
```

Do not introduce a new complex RBAC system as part of this feature unless DaxGov already supports action-level permissions cleanly.

---

# 27. API Changes

Cursor should inspect existing route conventions and reuse them.

Recommended additions.

## ORCA monitoring

```text
GET /api/orca/:id/monitoring
```

Returns:

```json
{
  "risk": {},
  "monitoringStatus": "Review Required",
  "mappedKris": [],
  "openReviews": []
}
```

Potential update:

```text
PUT /api/orca/:id
```

Can continue to handle the new monitoring fields.

## KRI threshold

Possible:

```text
GET /api/kri-records/:id/threshold
PUT /api/kri-records/:id/threshold
```

Or include threshold configuration inside existing KRI create/update endpoints.

Prefer fewer API surfaces if maintainable.

## KRI submission

Recommended:

```text
GET /api/kri-records/:id/submissions
POST /api/kri-records/:id/submissions
PUT /api/kri-submissions/:id
```

Request:

```json
{
  "year": 2026,
  "month": 8,
  "actualValue": 91.4,
  "remarks": "Six critical findings exceeded SLA.",
  "evidenceLink": "..."
}
```

Server:

1. Validate KRI.
2. Validate period.
3. Load threshold.
4. Calculate status.
5. Save submission.
6. If Breached:
   - load mapped ORCA risks
   - create ORCA reviews if one does not already exist for the same trigger
   - generate notification/activity events

Response:

```json
{
  "actualValue": 91.4,
  "status": "Warning"
}
```

## ORCA Risk Reviews

Add:

```text
GET /api/orca-risk-reviews
GET /api/orca/:id/reviews
POST /api/orca/:id/reviews
PUT /api/orca-risk-reviews/:id
```

Use existing API conventions if different.

---

# 28. Prevent Duplicate Risk Reviews

When a KRI breach is submitted or edited multiple times:

do not create duplicate open reviews for the same:

```text
ORCA risk
KRI
monitoring period
```

Implement either:

- composite uniqueness
- lookup-before-create
- transaction logic

Preferred uniqueness concept:

```text
orcaRiskId
kriRecordId
year
month
triggerType
```

If adding `year/month` directly to `OrcaRiskReview` simplifies this, do so.

---

# 29. Server Validation

Add strict validation.

## ORCA

Validate:

```text
kriMonitoringRequired
monitoringFrequency
nextMonitoringReviewDate
```

If:

```text
kriMonitoringRequired = false
```

require monitoring rationale before save if practical.

## KRI

Validate:

```text
unit
frequency
direction
threshold ranges
actualValue
```

Reject overlapping threshold bands.

Reject impossible ranges such as:

```text
min > max
```

## Submission

Reject:

```text
invalid month
future year outside allowed sheet
submission to archived KRI unless explicitly permitted
invalid actualValue
```

Do not trust client-calculated RAG status.

---

# 30. Suggested Reusable Services

Avoid embedding business logic directly inside route handlers.

Create reusable functions/services such as:

```ts
evaluateKriResult()
getCurrentKriPeriod()
getKriSubmissionStatus()
getOrcaMonitoringStatus()
getOrcaCoverageMetrics()
createRiskReviewsForKriBreach()
getRepeatedBreachCount()
calculateMonitoringEffectiveness()
```

Keep functions unit-testable.

---

# 31. Migration Strategy

Do not destroy or overwrite current data.

Before migrations:

1. inspect `schema.prisma`
2. inspect ORCA/KRI seed data
3. inspect how monthly values are currently stored
4. inspect database initialization behavior
5. inspect current test setup

Create additive Prisma migrations.

Legacy KRIs should remain functional.

For old KRIs without structured threshold configuration:

```text
thresholdMode = MANUAL
```

Their existing:

```text
Good
Warning
Breached
```

monthly statuses must continue rendering.

Do not force conversion of all historical records.

New KRIs should default to structured threshold mode.

---

# 32. Legacy KRI Handling

Current 2026 seeded KRIs predate Assessment 2026 and use old CS-* codes.

Do not silently remap CS-* codes to CYB-* codes.

Keep existing manual mappings intact.

Display a small badge if useful:

```text
Legacy Framework
```

The upgrade should support both:

```text
Legacy KRI
Structured KRI
```

until the organization fully transitions.

---

# 33. Mapping Suggestions

This is a later-phase improvement.

Do NOT automatically save mappings.

Provide suggestions only.

Candidate signals:

```text
same process
matching keywords
risk/threat similarity
data source hints
known tool names
```

Example:

```text
Qualys
→ suggest VAPT / Vulnerability Management ORCA risks
```

Display:

```text
Suggested Mapping
```

Require user confirmation.

---

# 34. Imports

Do not make Excel import part of the first implementation.

Later phase:

support controlled import for:

```text
ORCA
KRI Definitions
KRI monthly results
```

Requirements:

```text
preview
validation
duplicate detection
error report
dry-run
explicit confirmation
activity log
```

Never directly bulk insert unvalidated spreadsheet data.

---

# 35. Future Integrations

Do not assume live integrations currently exist.

Design the KRI structure so future connectors could submit actual values.

Potential later integrations:

```text
Qualys
Jira
IAM
SIEM / MSOC ticketing
Provintell
Cloud security tools
```

For now:

```text
dataSource
```

is descriptive metadata.

Manual KRI submission remains supported.

---

# 36. Management Reporting / Audit Pack

Later phase.

Add exportable report:

```text
ORCA & KRI Risk Monitoring Report
```

Suggested sections:

```text
Executive Summary
Residual Risk Distribution
KRI Coverage
KRI Health
Breached KRIs
High/Critical Risks with Breached KRIs
Unmonitored Risks
Open Risk Reviews
Overdue KRI Submissions
Risk Treatment Actions
Coverage Trend
```

Support:

```text
CSV
PDF later
```

Do not block the core workflow waiting for PDF generation.

---

# 37. UI Visual Direction

Use the existing DaxGov styling.

Do not redesign the entire application.

Enhance ORCA/KRI pages using:

- restrained cards
- clear RAG badges
- executive metrics
- charts
- simple drill-downs
- consistent spacing
- existing typography
- existing sidebar/navigation

Suggested management dashboard layout:

```text
-----------------------------------------------------
Management Risk Monitoring Status
-----------------------------------------------------

KRI Coverage | Breached KRI | High/Critical | Overdue

-----------------------------------------------------
Risk Monitoring Effectiveness | Residual Risk Donut
-----------------------------------------------------

-----------------------------------------------------
KRI RAG Distribution | KRI Trend
-----------------------------------------------------

-----------------------------------------------------
Coverage Trend | Management Attention Scale
-----------------------------------------------------

-----------------------------------------------------
Top Risks Requiring Attention
-----------------------------------------------------
```

---

# 38. Management Attention Scale

Add simple executive interpretation.

## Normal

Condition:

```text
Covered
Latest KRI Good
No open breach review
```

## Watch

Condition examples:

```text
Latest KRI Warning
or overdue monitoring review
or deteriorating KRI trend
```

## Management Attention

Condition:

```text
KRI Breached
AND mapped ORCA risk residual rating is High or Critical
```

or:

```text
Repeated breach
```

## Unmonitored Exposure

Condition:

```text
KRI Monitoring Required = true
AND active mapped KRI count = 0
```

Do not overwrite ORCA risk rating with this management category.

---

# 39. Risk Monitoring Effectiveness Scale UI

Show a gauge or scale.

Example:

```text
0        20        40        60        80       100
| Critical | Weak | Watch | Good | Strong |
```

Display:

```text
Risk Monitoring Effectiveness: 76 / 100
Status: Good
```

The score must be calculated.

Never hardcode production values.

---

# 40. Testing Requirements

Add/extend automated tests.

## ORCA tests

Test:

- save `kriMonitoringRequired`
- monitoring status calculation
- no KRI → Unmapped
- mapped valid KRI → Covered
- breached KRI with open review → Review Required
- Not Required logic

## KRI tests

Test:

- numeric threshold evaluation
- higher-is-better
- lower-is-better
- boundary values
- invalid overlapping thresholds
- submission creation
- status calculation
- legacy manual KRI compatibility

## Mapping tests

Test:

- mapping many KRIs to one ORCA
- mapping one KRI to many ORCA
- archived behavior
- year-specific mapping behavior remains intact

## Breach workflow tests

Test:

```text
submit breached KRI
→ mapped ORCA reviews are created
```

Test:

```text
submit same breach twice
→ duplicate review not created
```

Test:

```text
Good or Warning
→ risk review not automatically created
```

Test:

```text
complete review
→ monitoring status no longer Review Required if no other open reviews
```

## Permission tests

Test:

- admin
- ORCA user
- KRI user
- unauthorized user

## Dashboard tests

Test calculated metrics:

- coverage %
- breached count
- overdue submission count
- high/critical residual count
- open risk-review count
- monitoring effectiveness score

---

# 41. Iterative Implementation Roadmap

Implement this in the following order.

---

## ITERATION 1 — ORCA Monitoring Foundation

Goal:

Add monitoring requirement to ORCA without changing KRI behavior yet.

Implement:

- ORCA monitoring fields
- Prisma migration
- API validation
- ORCA KRI Required field
- monitoring rationale
- owner
- frequency
- next review date
- calculated monitoring coverage status
- new ORCA columns
- new ORCA filters

Acceptance criteria:

- existing ORCA CRUD still works
- existing ORCA scores still calculate correctly
- no existing data is lost
- monitoring status renders correctly

---

## ITERATION 2 — Structured KRI Definitions

Goal:

Allow new KRIs to have measurable structured thresholds.

Implement:

- KRI unit
- owner
- frequency
- data source
- threshold model
- threshold validation
- KRI Definition Wizard
- legacy manual threshold support

Acceptance criteria:

- legacy KRIs still render
- new KRIs support numeric thresholds
- threshold preview calculates correctly
- mappings can be created during KRI setup

---

## ITERATION 3 — Actual KRI Submission

Goal:

Replace manual RAG selection for structured KRIs.

Implement:

- actual value entry
- server-side evaluation
- remarks
- evidence link
- current period display
- submission status
- Due / Submitted / Overdue

Acceptance criteria:

- user enters numeric result
- server returns calculated status
- calculated status cannot be spoofed by client
- legacy KRIs remain editable using their current mode

---

## ITERATION 4 — Breach → ORCA Review

Goal:

Create the continuous risk-management loop.

Implement:

- `OrcaRiskReview`
- automatic review creation after KRI breach
- review-required ORCA badge
- ORCA KRI tab
- risk review modal
- risk review completion
- activity log
- notification

Acceptance criteria:

```text
KRI breach
→ ORCA review appears
→ reviewer documents decision
→ review closes
→ audit history records the lifecycle
```

No automatic residual risk changes.

---

## ITERATION 5 — KRI Coverage Workspace

Goal:

Make monitoring coverage visible and manageable.

Implement:

- dedicated KRI coverage page
- management summary
- risk-by-risk coverage table
- Create KRI
- Map KRI
- Open ORCA
- coverage filters

Acceptance criteria:

Management can immediately identify:

- covered risks
- partially covered risks
- risks requiring KRI but unmapped
- risks not requiring KRI
- risks requiring review

---

## ITERATION 6 — Management Dashboard

Goal:

Create presentation-ready risk monitoring visuals.

Implement:

- KPI cards
- monitoring effectiveness gauge
- residual risk distribution chart
- KRI health distribution
- current KRI trend
- top risks requiring attention
- management attention categories

Acceptance criteria:

Every chart and metric comes from live DaxGov data.

No mock production values.

---

## ITERATION 7 — Repeated Breach Escalation

Implement:

- consecutive breach detection
- escalation warnings
- repeated-breach risk review trigger
- management attention flag

---

## ITERATION 8 — Year-End KRI Review

Implement:

- Carry Forward
- Modify
- Retire
- Replace
- mapping review
- threshold rollover
- new-year confirmation

---

## ITERATION 9 — Monitoring History / Trend

Implement:

- coverage snapshots
- KRI coverage trend
- historical monitoring effectiveness
- management period comparison

---

## ITERATION 10 — Nice-to-Have Features

Implement only after core workflow is stable:

- mapping suggestions
- Excel import
- calculated/integrated KRIs
- Qualys integration
- Jira integration
- heatmaps
- audit packs
- BSP/VASP management reports
- PDF reporting
- automated evidence collection

---

# 42. Scope Guardrails

Do NOT do the following unless necessary for one of the iterations above:

- replace SQLite
- rebuild authentication
- redesign all DaxGov pages
- merge ORCA and KRI
- delete old KRI history
- automatically convert CS-* identifiers to CYB-*
- automatically change ORCA residual ratings after KRI breach
- automatically approve suggested mappings
- assume Qualys/Provintell/Jira APIs are currently available
- add a complex scoring framework before core workflow is implemented

---

# 43. Definition of Done

The ORCA/KRI upgrade is considered functionally complete when this scenario works end-to-end.

## Scenario

ORCA contains:

```text
CYB-3-6
Former employees retain access after offboarding
Residual Risk: High
KRI Monitoring Required: Yes
```

Mapped KRI:

```text
Offboarding Exceptions
Frequency: Monthly
Unit: Count

Good = 0
Warning = 1
Breached >= 2
```

User submits:

```text
August 2026
Actual Value = 3
```

DaxGov automatically calculates:

```text
BREACHED
```

DaxGov then:

1. saves the KRI submission
2. marks the KRI as Breached for August
3. creates an open ORCA risk review for CYB-3-6
4. shows `Review Required` in ORCA
5. shows the KRI breach inside the ORCA KRI tab
6. sends/creates an internal notification
7. records activity history
8. allows the reviewer to document a decision
9. does not automatically change residual risk
10. closes the risk review only after a human completes it
11. reflects the updated condition on the management dashboard

This workflow should work for one-to-many and many-to-many ORCA/KRI mappings.

---

# 44. Cursor Working Instructions

Before coding:

1. Inspect the current Prisma schema.
2. Inspect `server/orca.ts`.
3. Inspect `server/kris.ts`.
4. Inspect ORCA routes in `server/app.ts`.
5. Inspect `server/notifications.ts`.
6. Inspect `client/src/OrcaPage.tsx`.
7. Inspect `client/src/KriPage.tsx`.
8. Inspect `client/src/OrcaKriMapping.tsx`.
9. Inspect existing tests.
10. Identify reusable components and scoring helpers.

Then implement only the current iteration.

Do not attempt all iterations in a single large change.

For every iteration:

1. describe the files that will change
2. implement schema/API first
3. update the UI
4. add tests
5. run tests
6. fix regressions
7. preserve old behavior unless explicitly superseded
8. provide a short summary of the completed iteration

Prefer small, reviewable code changes.

---

# 45. Recommended First Cursor Prompt

Use this after Cursor reads this specification:

```text
Read the complete DaxGov ORCA ↔ KRI Continuous Risk Monitoring Upgrade specification.

Start with ITERATION 1 ONLY — ORCA Monitoring Foundation.

Before modifying anything, inspect the current Prisma schema and all relevant ORCA/KRI files named in the specification.

Implement the iteration in a backward-compatible manner.

Requirements:
- Do not replace SQLite.
- Do not break existing ORCA or KRI functionality.
- Do not change existing residual-risk scoring logic.
- Do not remove any existing mappings or history.
- Use existing DaxGov UI patterns.
- Add server-side validation.
- Add or update automated tests.
- Run the relevant tests after implementation.

At the end, provide:
1. files changed
2. schema changes
3. API changes
4. UI changes
5. tests added/updated
6. any migration command I need to run
7. any risks or follow-up items

Do not begin Iteration 2 until I explicitly ask.
```

---

# 46. Product Outcome

After these upgrades, DaxGov should no longer treat ORCA and KRI as two registers connected only through a mapping table.

The application should support a real continuous risk-monitoring lifecycle:

```text
Risk Identified
→ Risk Assessed
→ Monitoring Required
→ KRI Assigned
→ Actual Performance Measured
→ Threshold Evaluated
→ Breach Detected
→ Risk Review Triggered
→ Treatment Decision Recorded
→ Management Visibility
→ Continuous Monitoring
```

That should be the target architecture and user experience for the ORCA ↔ KRI capability.
