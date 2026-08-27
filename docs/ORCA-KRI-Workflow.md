# ORCA and KRIs in DaxGov — briefing for product updates

This note describes how **ORCA** and **KRIs** work in DaxGov today: what each page is for, how they connect, user workflows, data, permissions, and known gaps. Use it as the source of truth when proposing upgrades, UX improvements, and nice-to-have features. Do not assume Excel import, automatic mapping, or dashboard KPIs exist unless this document says they do.

**Product:** DaxGov (cybersecurity governance app for PDAX, a Philippine VASP).  
**Stack:** React client, Express API, Prisma, SQLite (`prisma/governance.db`).  
**Audience:** Product and engineering discussion of ORCA ↔ KRI interaction.

---

## 1. Mental model

```
ORCA  = the cyber risk register (Assessment 2026)
        “What can go wrong in our cyber processes?”

KRIs  = year-based monitoring indicators
        “How do we know this month whether those risks are in control?”

Mapping = optional many-to-many bridge
          One KRI can watch several ORCA risks.
          One ORCA risk can be watched by several KRIs.
```

They are **two registers**, not one screen. Linking is **manual**. Seeded KRIs use an older **CS-*** numbering scheme; ORCA uses **CYB-*** from Assessment 2026. The UI tells users those KRIs **start unmapped** until a new KRI framework is launched.

A third, separate consumer of ORCA is **Information Asset Inventory** research: Model Garden reads matching ORCA rows as internal context. That is not the KRI mapping UI.

---

## 2. What ORCA is

**Route:** `/orca`  
**Page key:** `orca`  
**UI title:** ORCA  
**Meaning in this app:** Operational / cyber risk assessment register for Cyber Security, seeded as **Assessment 2026**.

### What a row is

One **process-level cyber risk**, identified by a unique `riskNo` such as `CYB-1-1`.

Grouped under processes:

| Process no. | Process |
|-------------|---------|
| CYB-1 | Vulnerability Assessment and Penetration Testing |
| CYB-2 | Threat Response |
| CYB-3 | User Management |
| CYB-4 | Email / Endpoint |
| CYB-5 | Asset Management |
| CYB-6 | Security and Risk Assessments |

There are **30 seeded risks**.

### Fields (conceptual)

- Identity: process number, process name, risk number, category, threat, cause  
- Inherent: likelihood (1 Rare … 5 Frequent), impact (1 Incidental … 5 Critical), **score = likelihood digit × impact digit**, remarks  
- Treatment: strategy (Mitigate / Transfer/Share / Accept / Avoid), existing key controls, control effectivity (Effective / Needs Improvement / No Control), remarks  
- Impact: category (Financial, Reputational, Operational/Service, Compliance, Legal, Information Security), impact per risk  
- Residual: likelihood, impact, score, remarks, risk-management remarks  
- Actions: action item required (Y/N), risk acceptance required (Y/N), acceptance form link, action items, target completion date, status (Open / Closed)

The server **recomputes scores** from the rating text on every create/update. Users can see score columns, but ratings are the source of truth.

### What users can do on `/orca`

1. Search (risk no., process, threat, cause).  
2. Filter by process, inherent likelihood, control effectivity, residual likelihood, strategy, status.  
3. Expand rows, pick columns (saved in localStorage), export CSV.  
4. Star / watch a row (notifications).  
5. Add, edit, archive, restore.  
6. Open **Mapping** (page-level or per row) to link KRIs.

There is **no Excel import** on this page. First boot loads `server/orcaAssessmentSeed.json` if the table is empty.

---

## 3. What KRIs are

**Route:** `/kris`  
**Page key:** `kris`  
**UI title:** KRIs (Key Risk Indicators)

### What a sheet is

KRIs live on a **calendar-year sheet** (`KriSheet`): `year` + `status` (`Active` or `Archived`). Only one sheet is Active after a rollover.

### What a row is

One indicator on that sheet (`KriRecord`):

- `riskCode` (legacy, e.g. `CS-5-1`)  
- `riskName`  
- `kriNumber` (e.g. `KRI 1`, `KRI 2` — not unique across risks)  
- `keyRiskIndicator` (the actual metric text)  
- `weight` (0–1, shown as %)  
- Threshold **text**: Breached / Warning / Good (free text, not formulas)  
- Twelve months: each has a **result** (`Good` / `Warning` / `Breached` / blank) and **remarks**

### Seeded 2026 KRIs (current framework)

These are the five Active-sheet rows today. Codes do **not** match ORCA `CYB-*` IDs.

| Risk code | KRI no. | Indicator |
|-----------|---------|-----------|
| CS-5-1 | KRI 1 | Provintell monitoring: incident tickets and SLA (Info / Low / Medium / High / Critical) |
| CS-2-1 | KRI 1 | Qualys patching success rate |
| CS-2-1 | KRI 2 | SLA of risk-accepted critical risks that reached production |
| CS-6-1 | KRI 1 | Offboarding |
| CS-6-1 | KRI 2 | User access review |

January–July 2026 results are filled in seed data for several rows; later months are often empty.

### What users can do on `/kris`

1. Switch **year**.  
2. Search name, code, number, indicator.  
3. Toggle archived KRIs.  
4. See **ORCA sources** as a comma-separated list of mapped `riskNo`, or **Not mapped**.  
5. Expand rows, pick columns (`columns-kris` in localStorage), export CSV, star/watch.  
6. Add/edit on the **Active** sheet only. Archive/restore a row.  
7. **Archive year and start N+1** (rollover).  
8. Open **Mapping** (page or per KRI).

Banners:

- Active sheet: *These KRIs are from the previous framework and are not mapped to Assessment 2026. Use Mapping when the new KRIs launch.*  
- Archived sheet: *This is the saved {year} sheet. Switch to the current year to fill in the new year.*

The UI loads **page 1, 50 rows**. The API supports pagination; the page does not expose a pager.

---

## 4. How ORCA and KRIs interact

### 4.1 Mapping (the main interaction)

**UI:** modal `ORCA ↔ KRI mapping`, opened from either page.  
**Join table:** `KriOrcaMap` (`kriRecordId` + `orcaRiskId`, unique pair).  
**There is no automatic match** on codes, names, or similarity.

#### From the KRI side

- Left: KRIs for the selected year.  
- Right: Assessment 2026 ORCA risks.  
- Arrows labeled **sourced from**.  
- Empty state: **Not mapped to Assessment 2026**.  
- User picks a KRI, checks ORCA risks, **Save mapping**.  
- Saving **replaces** all ORCA links for that KRI (up to 200).

#### From the ORCA side

- Left: one selected ORCA risk.  
- Right: KRIs that monitor it.  
- Arrows labeled as indicators that monitor the risk.  
- User checks KRIs, **Save mapping**.  
- Saving **replaces** links for that ORCA risk **within the selected KRI year** only. Other years stay.

#### Shared copy in the modal

*The current KRIs predate Assessment 2026, so they start unmapped. Draw links here when the new KRIs launch.*

Year filter in the modal lets you map against Active or archived KRI sheets.

### 4.2 Year rollover

**Action:** Archive year and start `{year+1}`.

What copies to the new year:

- KRI definitions (code, name, number, indicator, weight, threshold text)  
- ORCA mappings  

What does **not** copy:

- Monthly results and remarks (new year starts blank)

The old sheet becomes Archived. You can still view it and still map that year.

### 4.3 Notifications (indirect interaction)

| Watch type | Page | When it appears |
|------------|------|-----------------|
| `orca` | `/orca` | Target date overdue or due within 30 days, and status is not Closed; **or** inherent score ≥ 20. Starred rows are “important”. |
| `kri-records` | `/kris` | Any month result is **Breached**. Starred rows are “important”. |

Only **non-archived** ORCA rows, and KRIs on the **Active** sheet, feed notices.

Mapping itself does not create notifications. A breached KRI does not automatically flag its mapped ORCA risks, and a high ORCA score does not automatically set a KRI month to Breached.

### 4.4 Information Asset Inventory (related, not the mapping UI)

When researching an inventory asset, the server can attach **matching ORCA risks** (token overlap with asset name / Daxon answers) as prompt context. That does not write `KriOrcaMap` and is not shown on the KRI page.

---

## 5. Typical user workflows

### A. Maintain the risk register

1. Open `/orca`.  
2. Filter to a process (e.g. User Management).  
3. Update residual ratings, controls, action items, status, target date.  
4. Star high-attention risks.  
5. Optionally map which KRIs should monitor that risk.

### B. Record monthly KRI results

1. Open `/kris` on the Active year.  
2. Find the indicator (e.g. Qualys patching success rate).  
3. Set this month’s result (Good / Warning / Breached) and remarks.  
4. If Breached, attention notices appear for watchers.  
5. Optionally open Mapping to confirm which Assessment 2026 risks this indicator covers.

### C. Link old KRIs to Assessment 2026 (intended “launch” workflow)

1. From `/kris` or `/orca`, click **Mapping**.  
2. Choose KRI year.  
3. Select a KRI (or an ORCA risk).  
4. Check the counterpart records.  
5. Save.  
6. KRI table **ORCA sources** column should list `CYB-*` numbers.

### D. Start a new calendar year

1. Finish the Active year.  
2. **Archive year and start {N+1}**.  
3. Fill blank months on the new sheet.  
4. Mappings carry over; adjust if the KRI catalog changes.

---

## 6. Permissions

| Page key | Grants |
|----------|--------|
| `orca` | `/orca` and `/api/orca*` |
| `kris` | `/kris`, `/api/kri-sheets*`, `/api/kri-records*` |

**Mapping APIs** (`GET/PUT /api/kri-mappings`): signed-in user who is Admin **or** has `orca` **or** `kris`.

Admins see every page. Ordinary users only see keys granted in User Management.

Activity log types include `orca-risk`, `kri-record`, `kri-sheet`, `kri-mapping`.

---

## 7. Data and APIs (for engineers)

### Models

- `OrcaRisk` — register row; `riskNo` unique; `archivedAt` soft archive; `kriMappings`  
- `KriSheet` — unique `year`; Active / Archived  
- `KriRecord` — belongs to sheet (cascade); monthly result/remark columns; `archivedAt`  
- `KriOrcaMap` — unique `(kriRecordId, orcaRiskId)`; cascade from either side  

### APIs

**ORCA (generic register)**

- `GET /api/orca` — search, `filter.*`, `archived`, pagination; order `sortOrder`  
- `POST /api/orca` — create + compute scores  
- `PUT /api/orca/:id` — update + recompute scores  
- `POST /api/orca/:id/archive` · `POST /api/orca/:id/restore`

**KRIs**

- `GET /api/kri-sheets`  
- `GET /api/kri-records?year=&search=&archived=`  
- `POST /api/kri-records` · `PUT /api/kri-records/:id`  
- `POST /api/kri-records/:id/archive` · restore  
- `POST /api/kri-sheets/rollover`  
- `GET /api/kri-mappings`  
- `PUT /api/kri-mappings` — body is either `{ kriRecordId, orcaRiskIds[] }` or `{ orcaRiskId, kriRecordIds[], year? }`

### Client files

- `client/src/OrcaPage.tsx`  
- `client/src/KriPage.tsx`  
- `client/src/OrcaKriMapping.tsx`  
- `client/src/RegisterPage.tsx` (ORCA table/CRUD)  

### Server files

- `server/orca.ts`, `server/orcaAssessmentSeed.json`  
- `server/kris.ts`, `server/kriSeed.json`  
- `server/app.ts` (ORCA routes)  
- `server/notifications.ts`  
- `server/informationAssets.ts` (ORCA as research context)

### Tests

- `tests/orca.test.ts`, `tests/kri.test.ts`, `tests/notifications.test.ts`, `tests/auth.test.ts`

---

## 8. What does **not** exist today (important for proposals)

Use this list so suggestions are upgrades, not duplicates.

1. **No auto-mapping** of `CS-*` KRIs to `CYB-*` ORCA risks.  
2. **No Excel / workbook import** for ORCA or KRIs at runtime (JSON seed on empty DB only).  
3. **Dashboard** (`/api/dashboard`) has **no** ORCA or KRI widgets.  
4. **No drill-through** from a KRI breach to mapped ORCA actions, or from a high ORCA score to the KRI month.  
5. **No calculated KRI** from ticket counts, Qualys %, or SLA — thresholds and monthly results are **typed by a person**.  
6. **Result values** are not strictly validated on the server (UI offers Good / Warning / Breached).  
7. **KRI pager** is missing even though the API paginates.  
8. **ORCA status** is often blank in seed; notices treat anything other than `Closed` as open.  
9. **Weight** is stored but not used in a portfolio score or RAG rollup.  
10. **No coverage report** (“these 30 ORCA risks have / don’t have a KRI”).  
11. Mapping modal does not suggest candidates (same process, similar text, Qualys ↔ CYB-1, etc.).  
12. Information Asset research uses ORCA independently of KRI maps.

---

## 9. Design intent already in the product copy

The team expected a **new KRI catalog aligned to Assessment 2026**. Until then:

- Keep 2026 monthly KRI history on the old CS-* framework.  
- Keep Assessment 2026 as the ORCA register of record.  
- Provide a mapping board so links can be drawn when new KRIs launch, without forcing a false CS-* ↔ CYB-* join.

Any upgrade should respect that, or explicitly replace it (e.g. launch a 2026-aligned KRI set and migrate mappings).

---

## 10. What to propose next (prompt for ChatGPT)

Please propose:

1. **Must-have upgrades** that fix workflow gaps (mapping coverage, year-end, notifications that respect maps, validation).  
2. **Should-have UX** improvements on `/orca`, `/kris`, and the mapping modal.  
3. **Nice-to-have** features (dashboards, suggested maps, imports, calculated KRIs, heatmaps, audit packs, BSP/VASP reporting).  
4. A **phased roadmap** (now / next quarter / later) that does not require replacing SQLite immediately.  
5. Anything that would make “KRIs monitor ORCA risks” true in operations, not only in a join table.

Constraints: PDAX is a BSP-supervised VASP; users are Cybersecurity and GRC staff; keep Admin vs User page grants; do not assume live Qualys/Provintell APIs unless listed as an integration phase.

Prefer concrete UI and data behaviors over generic GRC slogans.
