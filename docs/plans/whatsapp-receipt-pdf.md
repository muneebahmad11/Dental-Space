# Plan: send receipt PDFs on WhatsApp automatically

Prepared 2026-11-14. Goal: staff press one button (or nothing at all) and the patient receives the receipt **as a PDF in WhatsApp**, from the clinic's WhatsApp number, with delivery shown in the app.

Today the "WhatsApp PDF" button builds the PDF in the browser. On phones the share sheet attaches it; on a computer the PDF is saved and staff drag it into the chat. That stays as the fallback.

## How it will work

1. A payment is recorded. The receipt is saved as today.
2. Staff press **Send on WhatsApp**, or the clinic has turned on **send receipts automatically**.
3. The server checks the patient's WhatsApp consent and contact preferences, then queues a "receipt" job in the same transaction (no job without a receipt, no double send).
4. The worker builds the PDF on the server from the frozen receipt snapshot (the same `src/lib/receipt-pdf.ts` used in the browser), uploads it to WhatsApp's media store, and sends the clinic's approved **receipt template** with the PDF attached as its header document.
5. Meta's webhook reports sent, delivered, read or failed. The receipt row shows that status. A failure offers the existing manual button.

## What you need to do first (👤)

| Step | Notes |
|---|---|
| Hosting live on HTTPS (roadmap D1–D5) | Meta must reach the webhook URL. Localhost cannot receive it |
| Meta Business account, verified | Business documents. Verification takes days, sometimes longer |
| WhatsApp Business Account and a phone number | The number must not already be on the WhatsApp app (or must be moved off it) |
| Permanent access token and app secret | From a Meta system user. Stored in hosting secrets, never in chat or git |
| Template approval | A **utility** template named e.g. `payment_receipt` with a **Document** header and body text such as: “Assalam o Alaikum {{1}}, your receipt from {{2}} for {{3}} is attached. Receipt {{4}}. Balance remaining: {{5}}.” |
| Privacy text | Say that receipts are sent through WhatsApp (Meta) when the patient agrees |

Meta charges per template message sent outside a 24-hour window after the patient last wrote. Check Meta's current rate card for Pakistan before pricing the feature.

## Decision needed: whose WhatsApp number sends

| Option | What patients see | Effort | Recommendation |
|---|---|---|---|
| **A. One shared Dentalspace number** for all clinics | Messages from “Dentalspace”, clinic named in the text. Replies reach you, not the clinic | Smallest: one Meta verification, one number, server settings as today | Fast pilot only |
| **B. Each clinic's own number** | Messages from the clinic's own name and number; replies reach the clinic | Per-clinic credentials stored encrypted, operator screen to connect a clinic. Each clinic needs its own Meta verification (or you become a Meta Tech Provider later and use Embedded Signup) | **Recommended for selling**: matches roadmap item 7 |

Suggested path: build B, and pilot it with your first clinic, whose Meta setup you do together.

## Build steps

| # | Step | Size |
|---|---|---|
| 1 | **Per-clinic WhatsApp accounts.** New table `clinic_whatsapp_accounts` (phone number ID, business account ID, display number, status), access token **encrypted** (AES-GCM, key in hosting secrets), operator-only screen to connect, test and disconnect a clinic. Replaces the single `WHATSAPP_CLINIC_ID` setting; the env setup keeps working for option A | L |
| 2 | **Document templates.** Template config gains a header type (`document`). The Cloud API sender adds a header component with the uploaded media ID and file name (`Receipt R-….pdf`) | S |
| 3 | **Media upload.** Upload the PDF to `/{phone-number-id}/media` (multipart, `application/pdf`) and keep the media ID on the job. Bounded retries; a retried job past the media ID's lifetime uploads again | M |
| 4 | **PDF on the server.** The worker builds the PDF from the receipt snapshot. Logos: at upload the browser also saves a JPEG copy (new `jpeg_data` column), so the server needs no image library | S |
| 5 | **Receipt jobs.** `communication_jobs` gains `kind` (`template`/`receipt`) and `receipt_id`, unique per receipt for automatic sends; a deliberate resend creates a new, audited job. `POST /api/v1/receipts/:id/whatsapp` queues one. Clinic setting **Send receipts automatically after each payment** (off by default) queues it inside `postPayment` | M |
| 6 | **Consent rules.** Cloud API sending requires the recorded WhatsApp opt-in (existing `messaging_preferences` with evidence) **and** contact preferences allowing billing messages. Refusals show why, with the manual button as fallback | S |
| 7 | **Status in the app.** Receipt rows and the receipt page show Queued, Sent, Delivered, Read or Failed from the existing webhook history | S |
| 8 | **Tests.** Provider tests with fake responses (media upload, document payload, rate limits, ambiguous sends); database suite for queueing, consent refusal, one-send-per-receipt, resend audit, encrypted token never returned; tenant-isolation and operator suites cover the new routes | M |
| 9 | **Rollout.** Staging test to your own number (W2), then one clinic with automatic sending off, then on | 👤 |

Estimated build time: **3 to 4 working days** of code, plus Meta's verification and template review time, which we don't control.

## Out of scope for this step

- Appointment reminders sent automatically (W3) reuse steps 1, 5 and 6, so they become a small follow-up.
- Urdu templates: a second approved template language.
- Two-way chat inside the app.
