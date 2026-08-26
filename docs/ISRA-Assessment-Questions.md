# ISRA Assessment Questions

Complete list of questions asked on the **ISRA Assessment** page (guided Daxon questionnaire).

Source: `client/src/israQuestionnaire.ts`

A typical assessment has **43 questions** when one risk is raised. Discovery and submission questions are asked once. The Risk Register Builder block repeats if the respondent adds more risks (up to 100).

---

## How the form works

| Stage | Count | Repeatable? |
| --- | ---: | --- |
| Discovery (sections 1–8) | 26 | No |
| Risk Register Builder (per risk) | 14 + 1 follow-up | Yes — one set per risk |
| Submission details | 2 | No |

Unless noted, answers are required.

- **List** questions: one named item per row, or choose None.
- Default long-text help: *Share the relevant details. You may enter “None” or “Not applicable” when appropriate.*
- Default list help: *Add one named item per row. Choose None if nothing applies.*

---

## Discovery

### 1. Department Processes and Responsibilities

1. **List the main processes or activities performed by your department. Add one short name per row.**  
   Type: list (one name per row)  
   Placeholder: `e.g. Customer onboarding`

2. **List the processes considered critical to your daily operations. Add one short name per row.**  
   Type: list (one name per row)  
   Placeholder: `e.g. Payroll processing`

3. **List any manual processes or spreadsheets your department heavily relies on. Add one short name per row.**  
   Type: list (one name per row)  
   Placeholder: `e.g. Monthly reconciliation spreadsheet`

### 2. Data and Information Handling

4. **List each information asset your department manages or uses. Add one short name per row.**  
   Type: list (one name per row)  
   Placeholder: `e.g. Customer records`  
   Help: Each row becomes one Information Asset Inventory entry. Use a name, not a sentence. Examples: Customer records · Payroll files · Vendor contracts.

5. **Does your department handle confidential, personal, customer, financial, or other sensitive information?**  
   Type: long text

6. **Does your department send or receive sensitive information through email, messaging applications, file-sharing platforms, or other channels?**  
   Type: long text

### 3. Data Storage and Backup

7. **List each place this information is stored. Add one short name per row.**  
   Type: list (one name per row)  
   Placeholder: `e.g. Google Drive`  
   Help: Examples: shared drive, Google Drive, application, database, or local device. Choose None if nothing applies.

8. **Are copies or backups of the information maintained elsewhere?**  
   Type: long text

9. **List any important files or records that are not currently backed up. Add one short name per row.**  
   Type: list (one name per row)  
   Placeholder: `e.g. Local desktop reports`

### 4. Access Management

10. **List who has access to this information or storage location. Add one name, role, or team per row.**  
    Type: list (one name per row)  
    Placeholder: `e.g. Department staff`

11. **List any other departments that have access to your information or systems. Add one department per row.**  
    Type: list (one name per row)  
    Placeholder: `e.g. Finance`

12. **List any external parties, vendors, or partners that have access to your information or systems. Add one short name per row.**  
    Type: list (one name per row)  
    Placeholder: `e.g. Payroll vendor`

13. **How are new users given access, and how is access removed when someone transfers or leaves?**  
    Type: long text

14. **List any shared accounts, shared passwords, or shared access currently being used. Add one short name per row.**  
    Type: list (one name per row)  
    Placeholder: `e.g. Shared inbox account`

### 5. Systems and Applications

15. **List each application, system, or tool that is critical to your daily operations. Add one short name per row.**  
    Type: list (one name per row)  
    Placeholder: `e.g. Google Workspace`  
    Help: Each row becomes one Information Asset Inventory entry. Use the product or system name only. Examples: Google Workspace · JumpCloud · Qualys.

16. **For each application or system you just listed, who is the owner and who are the administrators?**  
    Type: list follow-up (one row per system from question 15)  
    Help: Each row is one system from your previous answer. Enter the owner and the administrators separately. Separate multiple admins with commas.

17. **List any of these systems that are managed or hosted by third parties. Add one short name per row.**  
    Type: list (one name per row)  
    Placeholder: `e.g. Google Workspace`

### 6. Business and Security Impact

18. **What would happen to your department if these systems or information became unavailable?**  
    Type: long text

19. **What would happen if the information was accidentally deleted, changed, or disclosed to an unauthorized person?**  
    Type: long text

20. **Could any of these events affect customers, operations, compliance, financial activities, or other departments?**  
    Type: long text

### 7. Known Issues and Incidents

21. **List any known security, access, system, or data-related issues within your department. Add one short name per row.**  
    Type: list (one name per row)  
    Placeholder: `e.g. Shared admin password`

22. **List any incidents, system outages, data loss, unauthorized access, or similar issues affecting the department. Add one short name per row.**  
    Type: list (one name per row)  
    Placeholder: `e.g. Email outage in March`

23. **List any recurring problems or workarounds that the department currently relies on. Add one short name per row.**  
    Type: list (one name per row)  
    Placeholder: `e.g. Manual access request via email`

### 8. Existing Controls and Improvements

24. **List each existing control or practice that already protects your information and systems. Add one short name per row.**  
    Type: list (one name per row)  
    Placeholder: `e.g. Multi-factor authentication`  
    Help: These controls are copied onto every inventory asset from this submission. Name only what is already in place. Examples: Multi-factor authentication · Quarterly access reviews · Encrypted laptops.

25. **List any areas where additional security controls or improvements are needed. Add one short name per row.**  
    Type: list (one name per row)  
    Placeholder: `e.g. Access recertification`

26. **List any risks or concerns that your department believes should be addressed. Add one short name per row.**  
    Type: list (one name per row)  
    Placeholder: `e.g. Unencrypted USB drives`

---

## Risk Register Builder

Asked once per risk. If the respondent answers **Yes** to “Do you have more risk to add?”, this whole block repeats.

### Risk details

27. **What information security risk do you want to raise today?**  
    Type: structured long text (three fields: event, cause, impact)  
    Help: Required format: “Risk of [event] Due to [cause] Resulting in [impact].”  
    Example: “Risk of unauthorized access to payroll files Due to excessive user permissions Resulting in exposure of employee personal information.”

28. **Which process, system, application, service, or activity is affected by this risk?**  
    Type: short text

29. **Before considering existing controls, how likely is this risk?**  
    Type: select  
    Options:
    - 1 — Rare
    - 2 — Unlikely
    - 3 — Possible
    - 4 — Likely
    - 5 — Frequent

30. **Before considering existing controls, how severe would the impact be?**  
    Type: select  
    Options:
    - 1 — Incidental
    - 2 — Minor
    - 3 — Moderate
    - 4 — Major
    - 5 — Critical

31. **List the controls already implemented to reduce this risk. Add one short name per row.**  
    Type: list (one name per row)  
    Placeholder: `e.g. Multi-factor authentication`  
    Help: List implemented controls only—not planned improvements. Choose None if nothing is in place yet.

32. **How effective are those existing controls?**  
    Type: select  
    Options:
    - 0% — No effective control
    - 25% — Weak or inconsistent
    - 50% — Partially effective
    - 75% — Generally effective
    - 100% — Fully effective and evidenced

33. **What evidence or reasoning supports that control-effectiveness rating?**  
    Type: long text

34. **After considering the controls, what is the remaining likelihood?**  
    Type: select  
    Options: same as question 29 (Rare → Frequent)

35. **After considering the controls, what is the remaining impact?**  
    Type: select  
    Options: same as question 30 (Incidental → Critical)

36. **How should the remaining risk be treated?**  
    Type: select  
    Options:
    - Mitigate — add or improve controls
    - Accept — retain with approval and rationale
    - Transfer — shift part of the risk
    - Avoid — discontinue or do not pursue

37. **What specific action or decision is required for this risk?**  
    Type: long text

38. **Who owns that action or treatment decision?**  
    Type: short text

39. **What is the target commitment date?**  
    Type: date  
    Required: no  
    Help: A commitment date is expected for mitigation actions. You may skip it if it is genuinely not applicable.

40. **Add supporting evidence or a reference, if available.**  
    Type: long text  
    Required: no  
    Help: Optional. You may enter a link, ticket number, file location, document name, approval reference, or a short note—or skip this question.

41. **Do you have more risk to add?**  
    Type: select  
    Options: Yes / No  
    Help: Tip: There are more risks than you think in every information that you hold.

---

## Submission Details

42. **Who completed this guided ISRA?**  
    Type: short text

43. **Finally, choose your department from the list, or type a new department or squad name. I’ll publish this assessment there.**  
    Type: department picker / short text  
    Help: A new department name is added to ISRA SPOG, Daxon answers, and the Information Asset Inventory when you submit.

---

## Quick reference (prompts only)

1. List the main processes or activities performed by your department. Add one short name per row.
2. List the processes considered critical to your daily operations. Add one short name per row.
3. List any manual processes or spreadsheets your department heavily relies on. Add one short name per row.
4. List each information asset your department manages or uses. Add one short name per row.
5. Does your department handle confidential, personal, customer, financial, or other sensitive information?
6. Does your department send or receive sensitive information through email, messaging applications, file-sharing platforms, or other channels?
7. List each place this information is stored. Add one short name per row.
8. Are copies or backups of the information maintained elsewhere?
9. List any important files or records that are not currently backed up. Add one short name per row.
10. List who has access to this information or storage location. Add one name, role, or team per row.
11. List any other departments that have access to your information or systems. Add one department per row.
12. List any external parties, vendors, or partners that have access to your information or systems. Add one short name per row.
13. How are new users given access, and how is access removed when someone transfers or leaves?
14. List any shared accounts, shared passwords, or shared access currently being used. Add one short name per row.
15. List each application, system, or tool that is critical to your daily operations. Add one short name per row.
16. For each application or system you just listed, who is the owner and who are the administrators?
17. List any of these systems that are managed or hosted by third parties. Add one short name per row.
18. What would happen to your department if these systems or information became unavailable?
19. What would happen if the information was accidentally deleted, changed, or disclosed to an unauthorized person?
20. Could any of these events affect customers, operations, compliance, financial activities, or other departments?
21. List any known security, access, system, or data-related issues within your department. Add one short name per row.
22. List any incidents, system outages, data loss, unauthorized access, or similar issues affecting the department. Add one short name per row.
23. List any recurring problems or workarounds that the department currently relies on. Add one short name per row.
24. List each existing control or practice that already protects your information and systems. Add one short name per row.
25. List any areas where additional security controls or improvements are needed. Add one short name per row.
26. List any risks or concerns that your department believes should be addressed. Add one short name per row.
27. What information security risk do you want to raise today?
28. Which process, system, application, service, or activity is affected by this risk?
29. Before considering existing controls, how likely is this risk?
30. Before considering existing controls, how severe would the impact be?
31. List the controls already implemented to reduce this risk. Add one short name per row.
32. How effective are those existing controls?
33. What evidence or reasoning supports that control-effectiveness rating?
34. After considering the controls, what is the remaining likelihood?
35. After considering the controls, what is the remaining impact?
36. How should the remaining risk be treated?
37. What specific action or decision is required for this risk?
38. Who owns that action or treatment decision?
39. What is the target commitment date?
40. Add supporting evidence or a reference, if available.
41. Do you have more risk to add?
42. Who completed this guided ISRA?
43. Finally, choose your department from the list, or type a new department or squad name. I’ll publish this assessment there.
