// MySQL INT is signed and stores at most 2147483647.
const MAX_ID = 2147483647;

function parseId(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const text = String(value).trim();
    if (!/^[1-9]\d*$/.test(text)) return null;
    const id = Number(text);
    return Number.isSafeInteger(id) && id <= MAX_ID ? id : null;
}

// Return a decimal as text, avoiding conversion to imprecise JavaScript floats.
// DECIMAL(10,2) => precision:10, scale:2; DECIMAL(10,4) => scale:4.
function parseDecimal(value, { precision = 10, scale, allowZero = true } = {}) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const text = String(value).trim();
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return null;
    const [integer, fraction = ''] = text.split('.');
    if (integer.length > precision - scale || fraction.length > scale) return null;
    if (!allowZero && !/[1-9]/.test(integer + fraction)) return null;
    return text;
}

function parseDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const year = Number(value.slice(0, 4));
    if (year < 1000 || year > 9999) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value
        ? null : value;
}

function isBody(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyFields(value, fields) {
    const keys = Object.keys(value);
    return keys.length > 0 && keys.every(key => fields.includes(key));
}

module.exports = { parseId, parseDecimal, parseDate, isBody, hasOnlyFields };
