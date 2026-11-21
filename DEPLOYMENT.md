# Deploy the cutting register

Use a Supabase project dedicated to this factory and an HTTPS static site at the root of its hostname. The steps below require access to your Supabase project and hosting account.

## 1. Create and secure the Supabase project

In the [Supabase dashboard](https://supabase.com/dashboard), create a project in your preferred region and record its project URL and public publishable key from the Connect dialog or API Keys settings. In Authentication, enable email/password, disable public signup and anonymous sign-in, and set an appropriate minimum password length. If using email invitations and password recovery in production, configure SMTP and test delivery. Supabase documents [Auth configuration](https://supabase.com/docs/guides/auth/general-configuration) and [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## 2. Apply both database migrations

In the project's SQL Editor, open a new query for each file and run the whole file, in this order.

1. [`supabase/migrations/202611210001_cutting_book.sql`](supabase/migrations/202611210001_cutting_book.sql)
2. [`supabase/migrations/202611210002_register_queries.sql`](supabase/migrations/202611210002_register_queries.sql)

For a fresh Supabase project, these migrations create the register, permissions, audit triggers, transactional write functions, report queries, and Realtime publication entries. Apply each migration once. Leave `public` enabled for the Data API. The migration uses Supabase’s `supabase_realtime` publication. [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).

## 3. Configure account redirects

Under Authentication URL Configuration, set **Site URL** to your production origin, such as `https://cutting.yourcompany.example`. Add the exact local redirect `http://localhost:5173/` while testing, and the production root URL for invitation or recovery links. Update the setting to the real domain before sending live invitations. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## 4. Create the first admin and provision other users

Create the first user under **Authentication → Users** with an email and a strong password. Use the email of that existing Auth account in the following SQL. Run it in the Supabase SQL Editor as the project owner.

```sql
insert into public.members (user_id, display_name, role, active)
select id, 'Factory Administrator', 'admin', true
from auth.users
where lower(email) = lower('REPLACE_WITH_YOUR_ADMIN_EMAIL');
```

Confirm that PostgreSQL inserted one row. For each other employee, create or invite their Auth user in Supabase, copy the user UUID, and add them in the app under **Settings → Members**. Choose Admin, Staff, or Viewer. An Auth account with no active membership has no access to the register. Deactivate membership in the app to remove database access. [Supabase Auth users](https://supabase.com/docs/guides/auth/users).

## 5. Build and host the frontend

Set the following build-time environment values locally in `.env.local` or in your hosting dashboard.

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Your project URL, typically `https://PROJECT_REF.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your public `sb_publishable_…` key or the project’s legacy anon key |

Run `npm ci` and `npm run build`, then publish the contents of `dist/` to an HTTPS static host. On a Git-connected host, set the project root to this folder, the build command to `npm run build`, and the publish directory to `dist`. Keep `/sw.js`, `/manifest.webmanifest`, and `/icons/` at the domain root and let the browser revalidate the service-worker file and `index.html` after a new deployment. Hash navigation works with static hosting. [Vite static deployment](https://vite.dev/guide/static-deploy.html).

For the `darpan750/Cutting` GitHub Pages deployment, build with `npm run build -- --base=/Cutting/` and publish the contents of `dist/` to the root of `gh-pages`. The Supabase Auth Site URL and allowed redirect use `https://darpan750.github.io/Cutting/` including the trailing slash.

## Verify on two devices

Use a test Supabase project or agree on a uniquely numbered test lot before trying the following on the live register.

1. Sign in as staff on two phones. Create a lot on phone A and check that it appears on phone B. Add a colour, batch and cut on A and check B again.
2. Open the same lot edit form on both phones. Save on A, then try to save older values on B. B should show a conflict or stale-draft warning, and the saved values from A should remain.
3. Confirm that a viewer can read, print and download reports. Confirm that a user without active membership cannot open the register. As admin, check the audit history for the staff changes.
4. Enter a ratio-based cut and a separate balance quantity. Compare the lot total and fabric reconciliation with the paper register. Run all report groups and open the downloaded PDF and `.xlsx` file. Confirm that expected names render on the report device. Print a lot and confirm the selected paper size and scaling.
5. Install from Chrome or Edge, or use Safari **Share → Add to Home Screen** on iPhone. Reopen from the icon and verify the lot is still there. Disconnect and confirm the offline notice, then reconnect and confirm live refresh.
6. Review the size list, confirmed custom fields, and jobwork amount convention with the cutting team before entering production records.
