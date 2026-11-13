import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clinicTemplates, fillTemplate, messageTemplates, rupees, saveTemplatesInput, templateProblem, templateText, whatsappNumber, whatsappUrl } from '../src/lib/messaging/templates.ts';

test('Pakistani phone numbers convert to WhatsApp international digits', () => {
  assert.equal(whatsappNumber('0300 4512778'), '923004512778');
  assert.equal(whatsappNumber('0321-9087112'), '923219087112');
  assert.equal(whatsappNumber('+92 333 6621405'), '923336621405');
  assert.equal(whatsappNumber('92 345 1209887'), '923451209887');
  assert.equal(whatsappNumber('0092 300 1234567'), '923001234567');
  assert.equal(whatsappNumber('3001234567'), '923001234567');
  assert.equal(whatsappNumber('+44 20 7946 0958'), '442079460958');
  for (const bad of ['', '042 3576 1234', '12345', 'none']) assert.equal(whatsappNumber(bad), null, bad);
});

test('templates fill every placeholder and tidy missing values', () => {
  const text = fillTemplate(messageTemplates.appointment_reminder.text, { patient: 'Ayesha', clinic: 'Al-Shifa', date: 'Monday 16 November', time: '4:30 PM', dentist: '', clinicPhone: '042 111 222' });
  assert.ok(text.includes('Ayesha') && text.includes('4:30 PM') && !text.includes('{'));
  assert.ok(!text.includes(' with .') && !text.includes('  '));
  assert.equal(fillTemplate('Hi {patient}, owe {balance}.', { patient: 'Bilal', balance: 'Rs 5,000' }), 'Hi Bilal, owe Rs 5,000.');
});

test('clinic wording overrides the standard text and empty resets it', () => {
  assert.equal(templateText('recall', { recall: '  Come back soon {patient}  ' }), 'Come back soon {patient}');
  assert.equal(templateText('recall', { recall: '' }), messageTemplates.recall.text);
  const list = clinicTemplates({ payment_due: 'Pay {balance} please, {patient}.' });
  assert.equal(list.find(t => t.key === 'payment_due')?.custom, true);
  assert.equal(list.find(t => t.key === 'recall')?.custom, false);
});

test('reworded templates may only use their own placeholders', () => {
  assert.equal(templateProblem('recall', 'Hello {patient}, time for a check-up at {clinic}.'), null);
  assert.match(templateProblem('recall', 'Hello {patient}, you owe {balance}.') ?? '', /cannot use \{balance\}/);
  assert.match(templateProblem('recall', 'Hi') ?? '', /between 10 and 700/);
  assert.equal(saveTemplatesInput.safeParse({ expectedVersion: 1, templates: { unknown_key: 'x' } }).success, false);
});

test('money reads the way patients write it', () => {
  assert.equal(rupees(500000), 'Rs 5,000');
  assert.equal(rupees('125050'), 'Rs 1,250.50');
  assert.equal(rupees(0), 'Rs 0');
  assert.equal(rupees(-2500), '-Rs 25');
  assert.equal(whatsappUrl('923001234567', 'Rs 5,000 & thanks'), 'https://wa.me/923001234567?text=Rs%205%2C000%20%26%20thanks');
});
