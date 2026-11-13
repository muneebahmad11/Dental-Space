import { z } from 'zod';
import type { ContactPurpose } from '../contact-preferences/contracts.ts';

// Ready-made WhatsApp texts staff open in WhatsApp (click-to-chat) and send themselves. No Meta account is needed.
// The clinic can reword each one; placeholders in {braces} are filled from the patient's real records on the server.
export const templateKeys = ['appointment_reminder', 'appointment_confirmation', 'missed_appointment', 'payment_due', 'payment_received', 'recall', 'estimate'] as const;
export type TemplateKey = typeof templateKeys[number];
export type TemplateNeed = 'appointment' | 'receipt' | 'plan' | 'balance' | null;

const common = ['patient', 'clinic', 'clinicPhone', 'address'] as const;
export const placeholderHelp: Record<string, string> = {
  patient: 'Patient name', clinic: 'Clinic name', clinicPhone: 'Clinic phone', address: 'Clinic address',
  date: 'Appointment date', time: 'Appointment time', dentist: 'Dentist name',
  balance: 'Amount still owed', amount: 'Amount paid', paidOn: 'Payment date', receipt: 'Receipt number',
  method: 'Payment method (Cash, Easypaisa…)', items: 'Each treatment the payment covered, one per line',
  total: 'Estimate total', validUntil: 'Estimate valid-until date',
};

export const messageTemplates: Record<TemplateKey, { label: string; purpose: ContactPurpose; need: TemplateNeed; placeholders: readonly string[]; text: string }> = {
  appointment_reminder: {
    label: 'Appointment reminder', purpose: 'appointment', need: 'appointment', placeholders: [...common, 'date', 'time', 'dentist'],
    text: 'Assalam o Alaikum {patient}, this is a reminder of your appointment at {clinic} on {date} at {time} with {dentist}. Please reply to confirm, or call {clinicPhone} to change the time.',
  },
  appointment_confirmation: {
    label: 'Booking confirmation', purpose: 'appointment', need: 'appointment', placeholders: [...common, 'date', 'time', 'dentist'],
    text: 'Assalam o Alaikum {patient}, your appointment at {clinic} is booked for {date} at {time} with {dentist}. Address: {address}.',
  },
  missed_appointment: {
    label: 'Missed appointment', purpose: 'appointment', need: 'appointment', placeholders: [...common, 'date', 'time', 'dentist'],
    text: 'Assalam o Alaikum {patient}, we missed you at {clinic} on {date}. Please reply or call {clinicPhone} to book a new time.',
  },
  payment_due: {
    label: 'Payment due', purpose: 'billing', need: 'balance', placeholders: [...common, 'balance'],
    text: 'Assalam o Alaikum {patient}, your balance at {clinic} is {balance}. You can pay at the clinic, or call {clinicPhone} if you have any questions.',
  },
  // A full receipt in the chat: WhatsApp shows *text* in bold and keeps the line breaks.
  payment_received: {
    label: 'Receipt', purpose: 'billing', need: 'receipt', placeholders: [...common, 'amount', 'method', 'paidOn', 'receipt', 'items', 'balance'],
    text: 'Assalam o Alaikum {patient},\n\n*Payment receipt from {clinic}*\nReceipt no: {receipt}\nDate: {paidOn}\nAmount paid: *{amount}* ({method})\n\nPaid for:\n{items}\n\nRemaining balance: *{balance}*\n\nThank you. For any questions please call {clinicPhone}.',
  },
  recall: {
    label: 'Check-up recall', purpose: 'recall', need: null, placeholders: [...common],
    text: 'Assalam o Alaikum {patient}, it is time for your dental check-up at {clinic}. Please reply or call {clinicPhone} to book a time that suits you.',
  },
  estimate: {
    label: 'Treatment estimate', purpose: 'billing', need: 'plan', placeholders: [...common, 'total', 'validUntil'],
    text: 'Assalam o Alaikum {patient}, your treatment estimate from {clinic} comes to {total}. It is valid until {validUntil}. Call {clinicPhone} with any questions.',
  },
};

const used = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
// Checks one reworded template: sensible length and only placeholders that template can fill.
export function templateProblem(key: TemplateKey, text: string): string | null {
  const t = text.trim();
  if (t.length < 10 || t.length > 700) return 'Keep each message between 10 and 700 characters.';
  const unknown = used(t).filter(p => !messageTemplates[key].placeholders.includes(p));
  return unknown.length ? `“${messageTemplates[key].label}” cannot use {${unknown[0]}}.` : null;
}
export const saveTemplatesInput = z.object({
  expectedVersion: z.number().int().positive(),
  // Only templates the clinic changed are stored; an empty or default text resets to the built-in wording.
  templates: z.partialRecord(z.enum(templateKeys), z.string().max(700)),
}).strict();
export const whatsappLinkInput = z.object({
  patientId: z.uuid(), template: z.enum(templateKeys),
  appointmentId: z.uuid().optional(), receiptId: z.uuid().optional(), planId: z.uuid().optional(),
}).strict();

export const templateText = (key: TemplateKey, overrides: Record<string, string> | null | undefined) => overrides?.[key]?.trim() || messageTemplates[key].text;
// Placeholders without a value (for example no dentist assigned) are dropped along with stray spacing.
export function fillTemplate(text: string, values: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '').replace(/ with \./g, '.').replace(/[ \t]{2,}/g, ' ').replace(/ ([.,])/g, '$1').trim();
}

// Pakistani numbers are stored as typed (0300 1234567, +92 300…). WhatsApp needs the international digits only.
export function whatsappNumber(phone: string): string | null {
  const plus = phone.trim().startsWith('+');
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('03')) d = '92' + d.slice(1);
  else if (d.length === 10 && d.startsWith('3')) d = '92' + d;
  else if (!plus && !d.startsWith('92')) return null;
  return d.length >= 10 && d.length <= 15 ? d : null;
}
export const whatsappUrl = (number: string, text: string) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

// Money as patients read it: "Rs 5,000" or "Rs 1,250.50".
export function rupees(minor: number | string | bigint) {
  const v = BigInt(minor); const neg = v < BigInt(0); const a = neg ? -v : v;
  const whole = new Intl.NumberFormat('en-PK').format(a / BigInt(100)); const paisa = a % BigInt(100);
  return `${neg ? '-' : ''}Rs ${whole}${paisa ? '.' + paisa.toString().padStart(2, '0') : ''}`;
}

// The clinic's wording for every template: its own where changed, otherwise the built-in text.
export function clinicTemplates(overrides: Record<string, string> | null | undefined) {
  return templateKeys.map(key => ({ key, label: messageTemplates[key].label, purpose: messageTemplates[key].purpose, placeholders: messageTemplates[key].placeholders, text: templateText(key, overrides), custom: Boolean(overrides?.[key]?.trim()), defaultText: messageTemplates[key].text }));
}
export type ClinicTemplate = ReturnType<typeof clinicTemplates>[number];
