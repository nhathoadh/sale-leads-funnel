# Sale Leads Funnel

Standalone daily operations dashboard for sales teams to review, filter, and prioritize seller leads through the conversion funnel.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `.env.example`. The database URLs come from the Vucar vault (Infisical project `vucar-data-pool`, env `prod`): copy `VUCAR_V2_READ_DATABASE_URL` and `VUCAR_ZALO_READ_DATABASE_URL` verbatim. Set the same variables on Vercel for deployed builds.

3. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000/sale-leads-funnel`.

## Datasources

- VuCar V2 database: leads, cars, sale status, bookings, inspections, sale activities.
- Zalo read database: phone-to-thread mapping and messages. Quotes are detected from outbound messages; AI agent messages (`source = 'bot'`) use stricter rules (`isAgentTextQuote`) so fee notes, conditional offers and echoes of the customer's own price are not counted.
- Dealer service HTTP API: dealer bids.

The project is standalone and does not import files from the Vucar E2E repository.
