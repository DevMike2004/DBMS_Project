const test = require('node:test');
const assert = require('node:assert/strict');
const { parseId, parseDecimal, parseDate, isBody, hasOnlyFields } = require('./validation');

test('IDs are positive, within signed MySQL INT range, and decimal integers only', () => {
    assert.equal(parseId('12'), 12);
    assert.equal(parseId(2147483647), 2147483647);
    for (const invalid of ['', '0', -1, 0, '1.5', '2e2', 'foo', '2147483648', {}, null]) {
        assert.equal(parseId(invalid), null);
    }
});

test('DECIMAL validators preserve precision and reject negative or overprecise input', () => {
    const quantity = { scale: 2 };
    const price = { scale: 4 };
    assert.equal(parseDecimal('99999999.99', quantity), '99999999.99');
    assert.equal(parseDecimal(5.5, quantity), '5.5');
    assert.equal(parseDecimal('0.0001', price), '0.0001');
    assert.equal(parseDecimal('0', quantity), '0');
    assert.equal(parseDecimal('0.00', { ...quantity, allowZero: false }), null);
    for (const invalid of ['-1', '1.000', '100000000', '1e3', NaN, null]) {
        assert.equal(parseDecimal(invalid, quantity), null);
    }
});

test('Dates must exist on the Gregorian calendar', () => {
    assert.equal(parseDate('2024-02-29'), '2024-02-29');
    for (const invalid of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-2-1', 20261126]) {
        assert.equal(parseDate(invalid), null);
    }
});

test('JSON body and editable-field helpers reject arrays and unknown fields', () => {
    assert.equal(isBody({ name: 'Milk' }), true);
    assert.equal(isBody([]), false);
    assert.equal(isBody(null), false);
    assert.equal(hasOnlyFields({ name: 'Egg' }, ['name']), true);
    assert.equal(hasOnlyFields({ unexpected: 1 }, ['name']), false);
    assert.equal(hasOnlyFields({}, ['name']), false);
});
