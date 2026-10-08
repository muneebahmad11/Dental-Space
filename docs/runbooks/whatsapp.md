# WhatsApp setup and operation

WhatsApp is disabled by default. The implementation uses Meta Cloud API directly (no archived SDK dependency), a PostgreSQL-backed queue, a separate worker and signed webhooks. No demo seed, migration or test sends patient messages.

## Configure Meta later

1. Create a Meta business app with WhatsApp, add your business phone number and obtain its phone-number ID, WhatsApp Business Account ID and a server access token with messaging permission.
2. Create and obtain approval for your utility templates in WhatsApp Manager. This slice supports text parameters in the template body; media/header/button parameters are not implemented.
3. Set the `WHATSAPP_*` fields validated in [the configuration module](../../src/server/messaging/config.ts) in server-only local/deployment secrets. Set a supported, explicit Graph API version. `WHATSAPP_CLINIC_ID` binds this deployment's sender to one clinic; other clinics cannot queue through it. Never place tokens in NEXT_PUBLIC variables.
4. Add only approved templates to `WHATSAPP_TEMPLATES_JSON`, with exactly the parameter labels/order expected by Meta. Configuration does not submit or approve a template at Meta. Give each template an optional `purpose`: `appointment` (default), `recall`, `billing` or `marketing`. Messages linked to an appointment always count as `appointment`. Sending is refused, and queued jobs are cancelled with `CONTACT_NOT_ALLOWED`, when the patient's contact preferences (patient profile) say do-not-contact or disallow WhatsApp or that purpose. Example: `{"name":"recall_notice","language":"en_US","label":"Recall","parameters":["Patient name"],"purpose":"recall"}`.
5. Deploy an HTTPS webhook at `/api/v1/webhooks/messaging/whatsapp`; configure the verify token in Meta and subscribe the business account to `messages`. GET returns the verified challenge; POST verifies HMAC SHA-256 against the raw body before using any data.
6. Explicitly provision `communication.read`, `communication.send`, `communication.preferences.write` and demographic read for the appropriate staff. Permissions are not granted by migrations. Reminder-linked messages also require appointment read.
7. Enable `WHATSAPP_ENABLED=true` only after configuration and a controlled test recipient are ready. Run `pnpm worker:start` as a supervised separate process with the restricted runtime database credential. Do not inject migration credentials into the web/worker deployment.
8. Record consent for a patient's international phone number, queue an approved template in Communications, then inspect worker/delivery status with Refresh status. Do not send real patient information during setup tests.

## Delivery integrity

Queue insertion and staff audit are atomic. Retries use a stable operation ID. Workers claim one job with SKIP LOCKED and a 90-second lease, and recheck current staff authorization, phone, consent/version, configured template and linked appointment/version before provider I/O. Cancelled, changed or elapsed appointments suppress linked reminders. Automatic scheduling from bookings is not enabled; linked reminders can be queued by the API.

429 responses use bounded backoff up to five claims. Timeouts, connection errors, 5xx responses and expired sending leases require review; Meta's send API is not treated as universally idempotent. A “review” job must be checked in WhatsApp Manager before an operator queues another message. An expired pre-send processing lease is recoverable. Cancellation cannot recall a message already being sent.

Delivery webhooks are bound to the configured account and phone ID. Receipt hashes deduplicate status events; delivery history is append-only and sent/delivered/read never regress. Early delivery receipts wait for the provider ID to be persisted. Incoming STOP, UNSUBSCRIBE, CANCEL and OPT OUT disable consent and cancel unsent jobs for every patient using that same phone in the configured clinic. Other incoming message text is not stored. Verified opt-out receipt records identify this as a patient/provider event; it is not attributed to a staff member.

Shared family phones require clinic review of consent and template content. This implementation does not create a general WhatsApp inbox or expose clinical notes. Follow-up automation, automatic reminder rules, template administration and multi-sender branch provisioning remain roadmap work.

## Verification

`pnpm test:messaging` validates signatures, outbound request shape, configuration redaction, rate limits and ambiguous-send handling using fake fetch responses. `pnpm db:verify-messaging` uses rollback-only synthetic PostgreSQL fixtures and a fake sender; no external messages are sent. Live Meta delivery and webhook reachability cannot be verified before the account, templates and hosted HTTPS endpoint are configured.

Sources: [Meta template API reference](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/), [Meta webhook verification reference](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/), [WhatsApp Business Messaging Policy](https://business.whatsapp.com/policy).
