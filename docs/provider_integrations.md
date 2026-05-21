# Provider Integrations

## Goal
Allow a user to sign in with their account and connect supported providers with the fewest possible steps.

## What supports true account linking
- Google Calendar: yes, via OAuth 2.0.
- Outlook Calendar / Microsoft 365: yes, via Microsoft OAuth 2.0 and Graph.

## What does not support the same flow
- iCalendar: no universal OAuth flow. Support it with `.ics` import/export and optional CalDAV account sync.
- Zillow: generally no end-user consumer OAuth for this product surface. In this repo, Zillow is a server-side data source through RapidAPI, not a user-linked account.

## Google Calendar
1. Create a Google Cloud project.
2. Enable the Google Calendar API.
3. Configure an OAuth consent screen.
4. Create a Web OAuth client.
5. Register redirect URI:
   - `https://api.YOURSITE.com/api/v1/integrations/google/callback`
6. Set these server env vars:
   - `GOOGLE_CALENDAR_CLIENT_ID`
   - `GOOGLE_CALENDAR_CLIENT_SECRET`
   - `GOOGLE_CALENDAR_REDIRECT_URI`
   - `GOOGLE_CALENDAR_SCOPES`
7. Build backend routes:
   - `GET /api/v1/integrations/google/connect`
   - `GET /api/v1/integrations/google/callback`
8. Store refresh tokens encrypted at rest using `backend.utils.security.encrypt_value()`.
9. Sync external events into `calendar_events` and keep provider event IDs for push/pull updates.

## Microsoft / Outlook Calendar
1. Create an app registration in Azure / Entra ID.
2. Add delegated permissions:
   - `User.Read`
   - `Calendars.ReadWrite`
   - `offline_access`
3. Register redirect URI:
   - `https://api.YOURSITE.com/api/v1/integrations/microsoft/callback`
4. Set these server env vars:
   - `MICROSOFT_CLIENT_ID`
   - `MICROSOFT_CLIENT_SECRET`
   - `MICROSOFT_TENANT_ID`
   - `MICROSOFT_REDIRECT_URI`
   - `MICROSOFT_SCOPES`
5. Build backend routes:
   - `GET /api/v1/integrations/microsoft/connect`
   - `GET /api/v1/integrations/microsoft/callback`
6. Exchange the auth code for tokens and store refresh tokens encrypted.
7. Sync events through Microsoft Graph and mirror them into `calendar_events`.

## iCalendar / Apple Calendar
Use two paths:
- Baseline path: `.ics` export/import. This already fits any calendar client.
- Connected path: CalDAV with user-provided server URL, username, and app password if the provider supports it.

Notes:
- Apple Calendar itself is usually reached through CalDAV, not a public Apple OAuth calendar API for this use case.
- If you want “one-click connect” parity with Google and Microsoft, the realistic target is Google and Microsoft first, then ICS import/export for everyone else.

## Zillow
This platform already uses Zillow-style property enrichment through RapidAPI.

Notes:
- That is not the same as signing a user into a Zillow account.
- For this repo, keep Zillow integration server-side and tie it to property lookups, not account login.

## Recommended platform flow
1. User logs into SOMB Vault normally.
2. User clicks `Connect Google Calendar` or `Connect Outlook`.
3. OAuth callback stores encrypted tokens server-side.
4. A sync job pulls events into `calendar_events`.
5. PDA reads from internal bookings plus synced provider events.

## Security requirements
- Never store provider refresh tokens in plaintext.
- Encrypt tokens before writing to the database.
- Keep provider scopes narrow.
- Persist provider account IDs and event IDs for clean resync and revoke.
- Add explicit disconnect routes that revoke or forget tokens.