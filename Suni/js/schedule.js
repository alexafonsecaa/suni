/* Shared 24-hour schedule contract; legacy am/pm keys remain for saved data. */
(function (root) {
  'use strict';
  const valid = value => Number.isInteger(value) && value >= 0 && value < 1440;
  const format = value => {
    if (!valid(value)) throw new RangeError('Hora fuera de rango');
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  };
  const parse = value => {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
  };
  const validate = rows => Array.isArray(rows) && rows.length === 7 && rows.every(d => d && valid(d.am) && valid(d.pm));
  const commands = rows => {
    if (!validate(rows)) throw new RangeError('Horario inválido');
    return rows.flatMap((d, i) => [`SETALARM=${i + 1},${format(d.am)}`, `SETSLEEP=${i + 1},${format(d.pm)}`]);
  };
  const api = { valid, format, parse, validate, commands };
  if (typeof module !== 'undefined') module.exports = api;
  else root.SuniSchedule = api;
})(globalThis);
