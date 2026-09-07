# Cybersecurity Governance Dashboard

Local React + Express + Prisma app for cybersecurity governance registers, TPSA monitoring, ISRA, and related modules. The UI is a single-page application (SPA). In development Vite serves it on port 5173 and proxies `/api` to Express. In production Express serves the built SPA and API from the same origin.

Local development still uses SQLite (`prisma/governance.db`). AWS deployments use Aurora Serverless v2 (PostgreSQL) in a dedicated VPC, with database credentials stored in AWS Secrets Manager.

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

To run the production SPA locally (UI and API on one port):

```bash
npm run build
npm start
```

Then open `http://localhost:5174`. `HOST` can be set for AWS (`0.0.0.0`).

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

- `npm test` — frontend (jsdom) and API unit/HTTP tests (HTTP suites use a temporary SQLite file, not `governance.db`)
- `npm run test:client` — React/jsdom unit tests only
- `npm run test:api` — server unit and HTTP tests only
- `npm run typecheck`
- `npm run build`
- `npm run db:prepare-rds` — write a PostgreSQL Prisma schema and migrations under `deploy/rds/` without touching `governance.db`
- `npm run db:deploy:rds` — apply those PostgreSQL migrations (`prisma migrate deploy`) when `DATABASE_URL` points at Aurora
- `npm run db:export-sqlite` — copy current SQLite rows to `deploy/rds/export.json` when you are ready to migrate

## AWS: dedicated VPC, HTTPS CDN, Aurora Serverless

Terraform in `terraform/` creates a VPC used only by DaxGov. CloudFront is the public HTTPS entry point. It reaches the dedicated VPC ALB (HTTPS when an ACM certificate is available, otherwise HTTP to the ALB with an origin-verify header). ECS Fargate runs in the public subnets and uses the VPC Internet Gateway for AWS APIs and outbound HTTPS, so this stack does not create a NAT gateway (NAT cannot be shared from another VPC). The ALB reaches those tasks over HTTPS. Aurora PostgreSQL Serverless v2 stays in private data subnets with no internet route. The database password is an RDS-managed Secrets Manager secret. Application secrets and Parameter Store config are created by Terraform and injected into ECS; the container never takes a password as a plaintext Terraform environment value.

1. Copy `terraform/terraform.tfvars.example` to `terraform/terraform.tfvars`. Leave `domain_name` empty to publish on the CloudFront default `*.cloudfront.net` hostname (HTTP from CloudFront to the internal ALB, HTTPS at the edge). For a custom hostname, set `domain_name` and either `route53_zone_id` or `certificate_arn` (regional, for the ALB) plus optionally `cloudfront_certificate_arn` (`us-east-1`). Use a VPC CIDR that does not overlap other VPCs in the account (do not reuse `segs-prod` `10.80.0.0/16`).
2. Create the registry first, then push the image, then apply the rest:

```bash
cd terraform
terraform init
terraform apply -target=aws_ecr_repository.app
cd ..
./scripts/push-ecr.sh "$(terraform -chdir=terraform output -raw ecr_repository_url)"
cd terraform
terraform apply
```

3. Open the `app_url` output (or `cloudfront_domain_name` if DNS is not in Route 53). Read the first Administrator password from Secrets Manager (`terraform output -raw app_secret_arn`, key `BOOTSTRAP_ADMIN_PASSWORD`). Watch CloudFront, ALB, ECS, and Aurora on the `daxgov` CloudWatch dashboard.

The ECS task receives only secret and parameter pointers (`DATABASE_SECRET_ARN`, `APP_SECRET_ARN`, `APP_CONFIG_PARAMETER`, `AWS_REGION`). Non-secret settings live in Parameter Store under `/daxgov/<environment>/config`, including `NODE_ENV` set to the Terraform `environment` value (`sandbox` by default). Credentials (JumpCloud, bootstrap admin password, Model Garden JSON, origin-verify) live in Secrets Manager, encrypted with the DaxGov CMK. ECS injects those values at start. The container then builds `DATABASE_URL` from the RDS-managed secret, runs `prisma migrate deploy` against the PostgreSQL schema in `deploy/rds/`, then serves the SPA from `/` and the API from `/api` over TLS. Health checks use `GET /health`. If Aurora already has tables from an earlier `db push`, the task baselines those migrations after catching up any missing columns.

The first Administrator password is in Secrets Manager (`/{name}/{environment}/app`, key `BOOTSTRAP_ADMIN_PASSWORD`). Retrieve it after apply; do not leave `ChangeMe-Admin-12` in production.

Aurora is in private data subnets and accepts TCP 5432 only from the app security group. The ALB is internal and accepts 443 only from CloudFront. File backup/restore in Settings stays SQLite-only; use Aurora snapshots in AWS after you migrate.

To copy local SQLite rows into Aurora, run `npm run db:export-sqlite` before cutover and load `deploy/rds/export.json` with a one-off import against the cluster. Keep a copy of `prisma/governance.db`.

## JumpCloud SSO

Local username/password stays on until JumpCloud SSO is configured. Create the DaxGov user first. JumpCloud sign-in matches `preferred_username`, SAML `username`/`NameID`, or the email local-part to `User.username`. Unmatched accounts are not created automatically.

The login page shows **Sign in with JumpCloud** when either OIDC or SAML is configured. `/api/auth/jumpcloud` picks the protocol automatically. If both are set, OIDC is used unless `JUMPCLOUD_SSO_PROTOCOL=saml`. On AWS, set the JumpCloud Terraform variables so client IDs and URLs go to Parameter Store and secrets/certificates go to Secrets Manager.

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
