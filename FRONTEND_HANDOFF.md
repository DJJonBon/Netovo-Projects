# Netovo Fax frontend handoff

## Current implementation

React 19, TypeScript, Vite, and Lucide icons. `src/styles.css` centralizes palette, typography, surfaces, radius, and shadow tokens in `:root`; responsive rules handle full desktop and narrow content panels. System font fallbacks require no font service. Text-only Netovo branding is a placeholder. Screens are switched with local React state; there is no routing or authentication dependency.

`src/App.tsx` provides the application shell, SendFax, FaxList (shared history/inbox), Detail dialog, OrganizationSettings, and reusable Badge, Notice, and ErrorMessage components. The detail dialog uses native modal focus handling and Escape dismissal. Forms use semantic labels, visible focus, accessible button names, and text status labels. Narrow history tables intentionally scroll horizontally to preserve all fields.

`src/domain.ts` defines the typed `FaxService`, job/context/query models, international-number validation, and basic PDF checks. `src/services/mock.ts` contains synthetic fixtures and a per-organization in-memory mock. `src/services/index.ts` is the explicit replacement point for a future authenticated Azure API adapter. UI components consume `FaxService`; the explicit demo error button and organization selector are demo-only scaffolding to remove/disable in production.

## Demo behavior and boundaries

- Both fictional organizations have their own mock instance. Reads, filters, and submissions operate on that instance. Cross-instance detail lookup fails. This is only a demonstration of isolation, never real access control.
- The service accepts a `File`, validates its extension/size/header, and discards the bytes after reading the header. Only metadata goes into memory. No persistence, document download, conversion, live sending, notifications, or provider calls exist.
- Local PDF object URLs are revoked on file replacement/removal, submission, screen change, organization change, and unmount. No documents or credentials enter localStorage/sessionStorage. Inline preview depends on the browser's PDF support; a local new-tab fallback is provided.
- Signature checking is a usability check, not proof a PDF is well-formed or safe. Future backend PDF validation, malware scanning, page limits, and MIME/content checks remain necessary.
- A submission returns queued; subsequent reads advance to sending at 2 seconds and delivered at 6 seconds. Seed data includes failures and inbound examples. `providerFaxId` is null for new demo submissions and clearly synthetic for seed records. Notification states explicitly indicate simulation.
- Delay exposes loading states. History has an explicit simulated error/retry control and searchable empty state. Status/date filters combine with search and pagination. Date boundaries are inclusive UTC dates; displayed timestamps use the user's local timezone.
- Retention dates are illustrative and document availability is explicitly unavailable in history. Actual server policy may differ. Refresh resets demo changes.
- Inbox is a design preview. Existing inbound email delivery does not populate it. All settings are read-only; roles do not grant permissions in this frontend.

## Proposed API contract — NOT existing endpoints

There is currently no browser-facing API. The paths below are proposals to agree with backend owners; no application code calls them.

| Proposed endpoint                                                        | Purpose                                                                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/context`                                                    | Authenticated organization name, tenant context, authorized user/role display, allowed sending numbers, retention policy             |
| `GET /api/v1/faxes?search=&status=&direction=&from=&to=&page=&pageSize=` | Server-filtered, paginated fax metadata; `{ items, total }`                                                                          |
| `GET /api/v1/faxes/{jobId}`                                              | Authorized detail, event timeline, notification state, retention/availability                                                        |
| `POST /api/v1/faxes`                                                     | Authenticated multipart request with sendingNumber, destination, and one PDF; proposed Idempotency-Key header; `202` plus queued job |
| `GET /api/v1/faxes/{jobId}/document`                                     | Authorized, audited, retention-aware document stream; server denies expired/unavailable documents                                    |

Use the domain's FaxJob shape as the initial metadata contract: `id`, nullable `providerFaxId`, `tenantId`, direction, sendingNumber, destination, filename, size, status, createdAt, updatedAt, submittedBy, notificationState, events, optional failureReason, documentExpiresAt. Expand live notification states beyond demo values and add authoritative `documentAvailability` before integration. Agree on UTC ISO timestamps, all provider terminal/intermediate statuses, pagination limits, stable sorting, error codes, and retry behavior.

The proposed API should return a structured error such as `{ code, message, requestId, fieldErrors? }`, with appropriate 401/403/404/409/413/422/429/5xx responses. Avoid leaking whether another tenant's job exists. Return user-safe errors while retaining operational details server-side. Use idempotency for submission retries so network failures cannot duplicate transmission.

## Outstanding Azure integration

1. Build and deploy an authenticated browser API with a chosen identity provider/session strategy. Replace the mock factory with a `FaxService` adapter, including cancellation, auth expiry handling, polling/backoff, and errors. Remove the demo selector and synthetic controls in live mode; never silently fall back to demo after an API failure.
2. Derive tenant membership and permissions server-side from verified identity. Treat the returned tenant ID only as context. Never accept a URL tenant ID or browser-provided sending number as authorization. Server-scope every list, detail, upload, and download and test cross-tenant denial.
3. Mediate Azure Logic Apps, Blob/Table Storage, Telnyx, and Key Vault on the server. Keep provider credentials, function keys, storage keys, and SAS URLs out of frontend fixtures/config. Public `VITE_*` variables are bundled and cannot hold secrets.
4. Connect browser submissions to the existing email-to-fax orchestration safely, retaining idempotent job IDs, provider IDs, event history, verified webhook updates, and notification outcomes. Existing webhook verification and notifications are backend capabilities, not frontend features implemented here.
5. Enforce upload constraints, document security, retention deletion, authorized download, rate limits, quotas, audit logging, and CSRF protections where applicable. Decide file/page limits and inbound retention with product owners.
6. Implement an explicit inbound portal ingestion path and authorization rules; current inbound email delivery does not create portal records.
7. Add real end-to-end integration tests, accessibility audit, supported-browser PDF checks, and production observability. Current automated tests cover mock send progression, data partitioning, filters/pagination/errors, and input checks.

## Future iframe / 3CX requirements — unverified

`?embedded=1` changes presentation only: it hides the standalone sidebar and header, using compact local screen tabs. No 3CX files are changed. No other query parameter is used for identity, tenant context, credentials, or navigation. Embedding has not been verified inside 3CX.

Before deployment, agree on permitted parent origins and configure CSP `frame-ancestors` (and compatible X-Frame-Options behavior) on the hosting server. Verify HTTPS, panel dimensions, scrolling, keyboard focus, inline PDF behavior, and mobile/narrow layouts inside the actual panel. Configure API CORS for exact authorized frontend origins; CORS is not authentication.

Select and test authentication under iframe third-party-cookie restrictions and identity-provider framing rules. A top-level login or a carefully designed session exchange may be needed. Never pass bearer tokens, passwords, tenant authority, or function keys in URLs. If using cookies, define Secure/HttpOnly/SameSite and CSRF defenses for the actual origin arrangement. If postMessage is introduced, validate the exact origin, source window, and message schema; never accept arbitrary tenant identity from the parent. No postMessage authentication exists today.

For production CSP, account for bundled scripts/styles and `blob:` local PDF object previews without permitting arbitrary remote embeds. Verify all hosting headers and auth flows in the target environment before describing embedding as supported.

## Verification performed

- Production TypeScript/Vite build passes; four mock workflow tests pass.
- Browser check: required-number validation, selecting the included synthetic PDF, review details, Simulate send, and history detail with all three delivery events and simulated notification state.
- Browser check: unmatched-search empty state, simulated loading error, retry, pagination, switching to Cedar & Pine, Inbox disclosure, and read-only organization settings.
- Responsive check: embedded Send Fax at a 390px viewport, no page-level horizontal overflow. This was a standalone browser preview of embedded presentation, not a 3CX iframe integration test.
- npm dependency audit reported zero known vulnerabilities after updating the test runner. GitHub Actions runs tests and build on pushes and pull requests; no remote run is claimed.

Run `npm run format` to format the source before extending it. Repeat browser and integration checks against the actual Azure environment when the API becomes available.
