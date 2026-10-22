const { test } = require('node:test');
const assert = require('node:assert/strict');
const schedule = require('../js/schedule.js');
const { dueReminder, validateSchedule } = require('../server/scheduler.cjs');
const rows = Array.from({ length: 7 }, () => ({ am: 480, pm: 1320 }));

test('every minute of the 24h day roundtrips; invalid times rejected', () => {
  for (let i = 0; i < 1440; i++) assert.equal(schedule.parse(schedule.format(i)), i);
  for (const value of ['24:00', '12:60', '-1:00', '8:00', '11:00 PM', '']) assert.equal(schedule.parse(value), null);
  assert.equal(schedule.format(0), '00:00');
  assert.equal(schedule.format(1439), '23:59');
});
test('sun and moon commands stay separate for all seven days', () => {
  const input = rows.map((d, i) => ({ am: i, pm: 1439 - i }));
  const commands = schedule.commands(input);
  input.forEach((d, i) => {
    assert.equal(commands[i * 2], `SETALARM=${i + 1},${schedule.format(d.am)}`);
    assert.equal(commands[i * 2 + 1], `SETSLEEP=${i + 1},${schedule.format(d.pm)}`);
    assert.ok(commands[i * 2].length <= 20);
  });
});
test('notification at 21:00 for 22:00, never for the wake-up time', () => {
  assert.equal(dueReminder(rows, 'UTC', new Date('2026-10-22T21:00:00Z')).key, '2026-10-22T22:00');
  assert.equal(dueReminder(rows, 'UTC', new Date('2026-10-22T20:59:00Z')), null);
  assert.equal(dueReminder(rows, 'UTC', new Date('2026-10-22T07:00:00Z')), null);
});
test('midnight and Sunday to Monday use the bedtime day', () => {
  const input = rows.map(d => ({ ...d })); input[0].pm = 30;
  assert.equal(dueReminder(input, 'UTC', new Date('2026-10-25T23:30:00Z')).key, '2026-10-26T00:30');
  assert.equal(dueReminder(input, 'UTC', new Date('2026-10-26T23:30:00Z')), null);
});
test('IANA zone and daylight-saving time represent 60 real minutes', () => {
  assert.equal(dueReminder(rows, 'America/Mexico_City', new Date('2026-10-23T03:00:00Z')).key, '2026-10-22T22:00');
  const input = rows.map(d => ({ ...d, pm: 210 }));
  assert.equal(dueReminder(input, 'America/New_York', new Date('2026-03-08T06:30:00Z')).key, '2026-03-08T03:30');
  assert.equal(validateSchedule(rows, 'Invalid/Zone'), false);
  assert.equal(validateSchedule([{ am: 0, pm: 1440 }], 'UTC'), false);
});
