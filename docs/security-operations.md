# Security and data-protection operations

## Before production deployment

1. Set a unique `JWT_SECRET` of at least 32 random characters in the hosting provider's secret store. Do not reuse the example value.
2. Set `CORS_ORIGINS` to the exact HTTPS origins serving the application. Same-origin requests do not require a CORS entry. Set `TRUST_PROXY_HOPS` to the actual number of trusted proxies (normally `1` on Railway); do not trust arbitrary forwarded headers.
3. Keep `DEMO_MODE=false`. `npm run seed` refuses to run unless explicitly enabled outside production.
4. Apply the idempotent schema using a reviewed deployment and a pre-deployment backup. The new `mustChangePassword` column defaults to `TRUE`; therefore every existing account must change its password at next login. Communicate this before rollout and provide users with a trusted password-change path.
5. Confirm TLS, database least-privilege access, provider PITR retention, and access-controlled encrypted storage for separate backups before importing real student data.

For a genuinely empty database, `npm run bootstrap:admin` creates the first Superadmin only when no Guru account exists, an explicit confirmation variable is set, and a 12-character-or-longer password is supplied through protected process environment variables. It runs the idempotent schema initializer first. Do not run it against a populated database or without a recent backup. Existing installations should retain/reset their authorized account instead. Unset the bootstrap variables immediately afterward.

## PostgreSQL backup and restore drill

Use a host with a compatible PostgreSQL `pg_dump` installed. Set `DATABASE_URL` in that process from a secret store, then run:

```powershell
.\scripts\backup-postgres.ps1 -Destination "D:\secure-backups\mma"
```

The script creates a custom-format dump and reports a SHA-256 checksum. The destination must be on a separate, encrypted, access-restricted storage service or volume, not only on the application host. Schedule it at least daily, retain provider PITR, and configure storage retention independently. The script does not upload, encrypt, or delete old backups.

For a restore drill, create a new isolated staging database, restore a selected dump with `pg_restore --no-owner --no-acl --dbname <staging-connection> <dump-file>`, and verify table counts, representative relations, and application health. Never restore over production as part of a drill. Record the backup timestamp, restore duration, verification results, and any corrective actions. Set the operational recovery objective to no more than three hours and repeat the drill at least quarterly.

## Account and audit controls

- Login uses bcrypt password hashes, a two-hour JWT lifetime, an account lock after five consecutive failures for 15 minutes, and process-local rate limits (3,000 login requests and 60,000 API requests per IP per 15 minutes). These limits are intentionally sized for the stated shared-NAT login peak; confirm/tune with staging load tests. The default limiter store is per process, so configure shared gateway-level limits before running multiple app instances.
- Newly provisioned accounts and reset accounts must change their password before accessing protected APIs. Passwords must be at least 12 characters.
- Admin, Superadmin, or Sekretariat may reset a Guru/Wali password through the protected admin API; reset increments the account session version and forces a password change, invalidating prior tokens.
- Password-reset audit entries record the actor and target only. Never add passwords, PINs, card tokens, biometric embeddings, or transfer evidence to logs.
- Keep audit and backup access limited to roles that need it; review access after staff changes.

## Children's personal data (UU PDP)

Student names, contact details, photographs, health notes, balances, academic records, and biometric templates are sensitive personal data about children. Before production use, the institution must document its lawful basis and guardian notices/consents where required, purposes and retention periods, role-based access, correction/deletion handling, processor agreements, incident notification responsibilities, and a contact for data-subject requests. Minimize collected fields, restrict biometric access to authorized cashless staff, encrypt transport and backups, and do not use real student data in load-test fixtures or non-isolated environments.

This repository documentation is an operational checklist, not legal advice or proof that provider-side PITR, scheduled backups, encryption, or restore drills have been configured. Those provider settings and drills remain unverified until an authorized operator completes them.
