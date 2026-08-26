# Cybersecurity Governance Dashboard

Local-only React + Express + Prisma/SQLite app for cybersecurity governance registers, TPSA monitoring, ISRA, and related modules. The API binds to `localhost` by default (`HOST` can be set later for AWS). JumpCloud SSO and Amazon RDS are prepared in code but stay off until you configure them. The live database is still SQLite.

## Run locally

```bash
npm install
npx prisma migrate deploy
npx prisma generate
npm run dev
```

- UI: `http://localhost:5173`
- API: `http://localhost:5174`

The SQLite database is `prisma/governance.db`. Do not replace or reset it unless you intend to wipe governance records.

## Sign in

If the database has no users, the API creates a bootstrap Administrator on first start:

- Username: `admin`
- One-time password: `ChangeMe-Admin-12`

If the first admin still uses `ChangeMe-Admin-12`, DaxGov blocks the rest of the app until that password is changed.

Passwords must be at least 12 characters, include letters and numbers, and must not match the username or the bootstrap password. Sessions are httpOnly cookies (`SameSite=strict`). Sign out destroys the server session. Mutating API calls require the `X-Requested-With: DaxGov` header.

## Access control

- **Admin** can open every module, User Management, and Settings database restore/reset.
- **User** can open only the page keys an Admin saved on that account.
- User Management (`/users`, `/api/users`) and Settings restore are Admin-only. They cannot be granted to a User.
- `/isra/daxon-answers` requires the `isra` page.
- Authorization is enforced on the server. Sidebar hiding is not the security boundary.

Grantable page keys: `dashboard`, `tpsa-monitoring`, `isra`, `isra-assessment`, `orca`, `kris`, `information-assets`, `documents`, `opir-actions`, `audit-findings`, `objectives`, `initiatives`, `activity-log`, `settings` (view and backup download only).

The last Active Admin cannot be deleted, disabled, or demoted.

## Activity log CSV

The Activity Log page and `GET /api/activity-log?format=csv` use a fixed column order:

`timestamp,application,event_type,action,outcome,severity,actor_id,actor_username,actor_role,src_ip,target_type,target_id,target_name,http_method,http_path,http_status,fields_changed,previous_value,new_value`

Passwords, hashes, and session tokens are never written. Existing SQLite activity rows keep their history and map onto the same columns.

## Scripts

- `npm test` — unit and auth HTTP tests (auth HTTP uses a temporary SQLite file, not `governance.db`)
- `npm run typecheck`
- `npm run build`
- `npm run db:prepare-rds` — write a PostgreSQL Prisma schema under `deploy/rds/` without touching `governance.db`
- `npm run db:export-sqlite` — copy current SQLite rows to `deploy/rds/export.json` when you are ready to migrate

## Later: Amazon RDS

The running app still uses `DATABASE_URL=file:./governance.db`. Do not change that until you are ready to migrate. When you are:

1. Keep a copy of `prisma/governance.db`.
2. Run `npm run db:export-sqlite`.
3. Run `npm run db:prepare-rds` and point a new Prisma generate/migrate at empty RDS PostgreSQL.
4. Set `DATABASE_URL` to the RDS URL (`postgresql://...`). File backup/restore in Settings then turns off; use RDS snapshots.

## Later: JumpCloud SSO

Local username/password stays on until JumpCloud SSO is configured. Create the DaxGov user first. JumpCloud sign-in matches `preferred_username`, SAML `username`/`NameID`, or the email local-part to `User.username`. Unmatched accounts are not created automatically.

The login page shows **Sign in with JumpCloud** when either OIDC or SAML is configured. `/api/auth/jumpcloud` picks the protocol automatically. If both are set, OIDC is used unless `JUMPCLOUD_SSO_PROTOCOL=saml`.

### OpenID Connect

Set both:

- `JUMPCLOUD_CLIENT_ID`
- `JUMPCLOUD_CLIENT_SECRET`

Optional: `JUMPCLOUD_ISSUER` (default `https://oauth.id.jumpcloud.com/`), `JUMPCLOUD_REDIRECT_URI` (default `{origin}/api/auth/jumpcloud/callback`).

In JumpCloud, create an **OIDC** SSO application. Redirect URL: `http://localhost:5173/api/auth/jumpcloud/callback` (or your HTTPS origin).

### SAML 2.0

Set both:

- `JUMPCLOUD_SAML_ENTRYPOINT` (JumpCloud SSO URL, e.g. `https://sso.jumpcloud.com/saml2/<app>`)
- `JUMPCLOUD_SAML_IDP_CERT` (JumpCloud IdP certificate PEM or base64 body)

Optional aliases: `JUMPCLOUD_SAML_SSO_URL`, `JUMPCLOUD_SAML_CERT`, `JUMPCLOUD_SAML_IDP_CERT_FILE` (path to a `.pem` file).

In JumpCloud, create a **SAML** SSO application and paste these DaxGov values:

- ACS URL: `{origin}/api/auth/jumpcloud/saml/acs`
- SP Entity ID: `{origin}/api/auth/jumpcloud/saml/metadata`
- Login URL: `{origin}/api/auth/jumpcloud` or `{origin}/api/auth/jumpcloud/saml`
- SP metadata: `GET {origin}/api/auth/jumpcloud/saml/metadata`

Local example origin: `http://localhost:5173`. On a published host, use `https://your-host`.

Optional SAML settings: `JUMPCLOUD_SAML_ISSUER` / `JUMPCLOUD_SAML_SP_ENTITY_ID` (must match JumpCloud’s SP Entity ID), `JUMPCLOUD_SAML_CALLBACK_URL` (must match ACS), `JUMPCLOUD_SAML_IDP_ENTITY_ID`, `JUMPCLOUD_SSO_PROTOCOL=saml`.

Shared optional: `JUMPCLOUD_EMAIL_DOMAINS` (comma-separated, e.g. `pdax.ph`), `JUMPCLOUD_DISABLE_PASSWORD=true` after SSO works.
