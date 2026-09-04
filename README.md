# Sale Leads Funnel

Standalone daily operations dashboard for sales teams to review, filter, and prioritize seller leads through the conversion funnel.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `.env.example` and fill the datasource values.

3. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000/sale-leads-funnel`.

## Datasources

- VuCar V2 database: leads, cars, sale status, bookings, inspections, sale activities.
- E2E signal database: agent signal snapshots.
- Zalo read database: phone-to-thread mapping and messages.
- Dealer service HTTP API: dealer bids.

The project is standalone and does not import files from the Vucar E2E repository.
