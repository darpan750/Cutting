# Jeans Manufacturing Cutting Book

A mobile-first lot register with a React frontend and a Supabase PostgreSQL backend. Each normalized lot number is its database primary key. The register starts empty apart from size definitions 28 through 42. All production records live in the shared Supabase project.

## What the register covers

- Lot details, order and style references, fabric colours, batches and barcodes, inward metres, shrinkage, and fabric reconciliation.
- Actual piece counts or ratio × layers, with separate balance pieces by size, batch, and colour. Size columns, display order, and custom fields are configurable.
- Karigar jobwork issue and receive rows within each lot, including damage, pending pieces, rate, and sign-off. The lot also has a printable register with signature lines.
- Dashboard, searchable lots, date/style/colour filters, audit history, and production reports by lot, date, colour, size, or total. Reports download as `.xlsx` and `.pdf` and can be printed.
- Installable PWA with shared online data. The app displays an offline notice, and saving requires connectivity. Supabase Auth persists the sign-in session on the device.

## Local setup

1. Install Node.js 22.12 or newer. Open a terminal in this directory.
2. Run `npm ci` to install the versions listed in `package-lock.json`.
3. Complete steps 1–4 in [Deployment](DEPLOYMENT.md) to get a Supabase project, database, and first admin account.
4. Copy `.env.example` to `.env.local`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the project. The app requires the public publishable key. Keep secret keys and database passwords in Supabase or your own secret manager.
5. Run `npm run dev` and open the address Vite prints, normally `http://localhost:5173/`. Sign in using the account you created in Supabase.

## Using the register

1. Create a lot and enter the dates and order details. Lot numbers are trimmed and stored in uppercase. The number stays fixed after creation.
2. In the lot, add a colour, then add one or more fabric batches for that colour.
3. Add a cutting entry, select its batch, and enter the size quantities. For ratio entries, add layers and a ratio for each relevant size. Enter the material used in the main and balance cuts. The form can copy marker length × layers into main metres for review.
4. Review the lot reconciliation, add jobwork and remarks, then mark the lot complete from **Edit lot** once it has positive cutting quantities.
5. Use **Print lot** for the register and **Reports** for PDFs and Excel workbooks. The report date range uses each cutting entry’s date. Lot-search date range uses the lot date. Lot search accepts dates in `YYYY-MM-DD`.

### Register conventions

- Total pieces = main pieces + balance pieces. Remaining fabric = inward metres − main metres used − balance metres used − wastage. A negative remaining value highlights a batch to review. Average = used metres ÷ total pieces.
- Jobwork amount = issued pieces × rate, following the reference sheet. Pending pieces = issued − good received − damaged. Jobwork quantities are tracked separately from cutting production.
- The default timezone for today's dashboard and history display is Asia/Kolkata. Custom fields can be added for lot, batch, cutting, and jobwork. Confirm the plant’s terms and units before defining an unclear field. Ambiguous reference abbreviations and automatic balance allocation have no predefined rule. The reference values appear in calculation tests only.
- Reports use active lots and count each productive cutting entry once in the grand total. An entry cutting several sizes can appear in several size rows. Per-group entry counts therefore need not add up to the grand total.
- PDF downloads render visible text using the device's fonts. This supports available local scripts and produces an image-based PDF. Browser print is also available for the report and lot register.

### Permissions and shared editing

| Role | Access |
| --- | --- |
| Admin | Full register access. Deletes linked records in reverse order, archives or restores lots, configures the register, assigns roles, and sees the full audit history. |
| Staff | Creates and updates lots, colours, batches, cutting entries and jobwork. Views and exports production. |
| Viewer | Reads the active lot register and lot history, and prints or exports reports. |

Every production mutation goes through a PostgreSQL transaction. The database locks the lot and compares its revision with the one the editor opened. If someone saves first, the second save is rejected and its draft stays visible for review. Close and reopen the editor to see the current record before reapplying changes. With Supabase Realtime, foreground devices refresh when the register changes. Focus, reconnect, and a periodic refresh catch missed events.

Admin deletion of a lot archives it and retains its history and unique number. Admins can find archived lots using the status filter. Child records can be deleted when dependencies permit, and their previous values remain in the audit log. Audit records show the actor, time, and before/after values. Auth login and active register membership are both required to see production data.

## Checks

```sh
npm test
npm run build
npm run preview
```

The tests run the production calculations and load both migrations into an isolated PostgreSQL test runtime. Test accounts and records are ephemeral and never become part of the hosted database. Use the [deployment verification steps](DEPLOYMENT.md#verify-on-two-devices) for hosted Auth, Realtime, exports, and installation.
