# Scheduling setup runbook

## Configure a branch (`/schedule-setup`)

Requires `schedule.configure`. Staff with only `appointment.read` see the configuration read-only.

1. **Opening hours**: add up to four periods per weekday (e.g. 09:00–13:00 and 14:00–20:00 for a lunch break). Leave a day empty for closed. Choose the calendar slot length. Until hours are saved once, bookings are not limited to opening times.
2. **Dentist calendars**: one per dentist working in this branch. Optionally link the dentist's staff login so visits can be matched to the calendar. One staff account can be linked to only one dentist calendar per branch.
3. **Chairs**: optional; add them only if chair double-booking must be prevented.
4. **Closed dates**: holidays or other closures, today or later. If bookings already exist on that date, the screen shows how many; they are **not** cancelled automatically, so reschedule them.

## Corrections

Nothing is deleted. Deactivate a dentist or chair that is no longer used; reopen a closed date added by mistake. Every change is stored as a numbered revision with the staff member and time, and appears in the audit log.

## Times

All times are clinic-local (the clinic timezone, `Asia/Karachi` in development), regardless of the device timezone.
