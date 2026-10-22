'use strict';
const Schedule = require('../js/schedule.js');
const formatters = new Map();
function formatter(zone) {
  if (!formatters.has(zone)) {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    f.format(new Date());
    if (formatters.size > 100) formatters.clear();
    formatters.set(zone, f);
  }
  return formatters.get(zone);
}
function validateSchedule(rows, zone) {
  if (!Schedule.validate(rows) || typeof zone !== 'string' || zone.length > 80) return false;
  try { formatter(zone); return true; } catch { return false; }
}
function dueReminder(rows, zone, now) {
  // Actual elapsed 60 minutes: DST changes are resolved using the target instant.
  const target = new Date(now.getTime() + 3600000);
  const parts = Object.fromEntries(formatter(zone).formatToParts(target).map(p => [p.type, p.value]));
  const weekday = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day)).getUTCDay();
  const index = (weekday + 6) % 7;
  if (rows[index].pm !== +parts.hour * 60 + +parts.minute) return null;
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  return { key: `${date}T${time}`, title: 'Se acerca tu hora de descansar', body: `Tu hora de dormir es a las ${time}. Falta una hora: comienza a prepararte para descansar.`, tag: `suni-sleep-${date}`, url: '/' };
}
module.exports = { validateSchedule, dueReminder };
