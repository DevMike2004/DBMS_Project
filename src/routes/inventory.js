const express = require('express');
const pool = require('../mysql');
const { parseId, parseDecimal, parseDate, isBody, hasOnlyFields } = require('../utils/validation');
const router = express.Router();

const FIELDS = [
    'ingredient_id', 'location_id', 'quantity',
    'purchase_date', 'expiration_date', 'unit_cost'
];

function validateInventory(data, { requirePurchaseDate = false } = {}) {
    const ingredientId = parseId(data.ingredient_id);
    const locationId = parseId(data.location_id);
    const quantity = parseDecimal(data.quantity, { scale: 2 });
    const unitCost = data.unit_cost == null
        ? null : parseDecimal(data.unit_cost, { scale: 4 });
    const purchaseDate = data.purchase_date === undefined && !requirePurchaseDate
        ? null : parseDate(data.purchase_date);
    const expirationDate = data.expiration_date == null
        ? null : parseDate(data.expiration_date);

    if (!ingredientId) return { error: 'ingredient_id must be a positive integer' };
    if (!locationId) return { error: 'location_id must be a positive integer' };
    if (quantity === null) return { error: 'quantity must be a nonnegative DECIMAL(10,2)' };
    if (unitCost === null && data.unit_cost != null) {
        return { error: 'unit_cost must be null or a nonnegative DECIMAL(10,4)' };
    }
    if (purchaseDate === null && (requirePurchaseDate || data.purchase_date !== undefined)) {
        return { error: 'purchase_date must be a valid YYYY-MM-DD date' };
    }
    if (expirationDate === null && data.expiration_date != null) {
        return { error: 'expiration_date must be null or a valid YYYY-MM-DD date' };
    }

    return {
        value: {
            ingredient_id: ingredientId, location_id: locationId, quantity,
            purchase_date: purchaseDate, expiration_date: expirationDate, unit_cost: unitCost
        }
    };
}

// GET /api/inventory[?location_id=2] — only batches with quantity > 0.
router.get('/', async (req, res, next) => {
    try {
        const locationId = req.query.location_id === undefined
            ? null : parseId(req.query.location_id);
        if (req.query.location_id !== undefined && !locationId) {
            return res.status(400).json({ error: 'location_id must be a positive integer' });
        }
        const [rows] = await pool.query(
            `SELECT b.id, b.ingredient_id, i.name AS ingredient_name,
                    i.base_unit, b.location_id, l.name AS location,
                    b.quantity, b.purchase_date, b.expiration_date, b.unit_cost,
                    CASE WHEN b.expiration_date < CURDATE() THEN 1 ELSE 0 END AS is_expired
             FROM inventory_item b
             JOIN ingredient i ON i.id = b.ingredient_id
             JOIN storage_location l ON l.id = b.location_id
             WHERE b.quantity > 0
               AND (? IS NULL OR b.location_id = ?)
             ORDER BY l.name, i.name, b.expiration_date IS NULL, b.expiration_date, b.id`,
            [locationId, locationId]
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// GET /api/inventory/expiring[?days=7] — today through N days from today.
router.get('/expiring', async (req, res, next) => {
    try {
        const value = req.query.days === undefined ? '7' : req.query.days;
        if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) {
            return res.status(400).json({ error: 'days must be an integer from 0 to 365' });
        }
        const days = Number(value);
        if (!Number.isSafeInteger(days) || days > 365) {
            return res.status(400).json({ error: 'days must be an integer from 0 to 365' });
        }
        const [rows] = await pool.query(
            `SELECT b.id, b.ingredient_id, i.name AS ingredient_name,
                    i.base_unit, b.location_id, l.name AS location,
                    b.quantity, b.purchase_date, b.expiration_date, b.unit_cost,
                    DATEDIFF(b.expiration_date, CURDATE()) AS days_until_expiration
             FROM inventory_item b
             JOIN ingredient i ON i.id = b.ingredient_id
             JOIN storage_location l ON l.id = b.location_id
             WHERE b.quantity > 0
               AND b.expiration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
             ORDER BY b.expiration_date, i.name, b.id`,
            [days]
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// POST /api/inventory — each purchase becomes a NEW batch.
router.post('/', async (req, res, next) => {
    try {
        if (!isBody(req.body) || !hasOnlyFields(req.body, FIELDS)) {
            return res.status(400).json({ error: 'Invalid inventory fields' });
        }
        const { error, value } = validateInventory(req.body);
        if (error) return res.status(400).json({ error });
        if (Number(value.quantity) === 0) {
            return res.status(400).json({ error: 'A new purchase must have positive quantity' });
        }
        const [result] = await pool.query(
            `INSERT INTO inventory_item
                 (ingredient_id, location_id, quantity, purchase_date, expiration_date, unit_cost)
             VALUES (?, ?, ?, COALESCE(?, CURDATE()), ?, ?)`,
            [value.ingredient_id, value.location_id, value.quantity,
                value.purchase_date, value.expiration_date, value.unit_cost]
        );
        // Read back the generated purchase date when the caller omitted it.
        const [created] = await pool.query(
            `SELECT id, ingredient_id, location_id, quantity,
                    purchase_date, expiration_date, unit_cost
             FROM inventory_item WHERE id = ?`,
            [result.insertId]
        );
        res.status(201).json(created[0]);
    } catch (err) {
        next(err);
    }
});

// PUT /api/inventory/:id — partial edits allowed, quantity 0 retains the batch.
router.put('/:id', async (req, res, next) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid inventory batch ID' });
    if (!isBody(req.body) || !hasOnlyFields(req.body, FIELDS)) {
        return res.status(400).json({ error: 'Supply one or more editable batch fields' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [current] = await connection.query(
            `SELECT ingredient_id, location_id, quantity, purchase_date,
                    expiration_date, unit_cost
             FROM inventory_item WHERE id = ? FOR UPDATE`,
            [id]
        );
        if (current.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Inventory batch not found' });
        }
        const { error, value } = validateInventory(
            { ...current[0], ...req.body }, { requirePurchaseDate: true }
        );
        if (error) {
            await connection.rollback();
            return res.status(400).json({ error });
        }
        await connection.query(
            `UPDATE inventory_item
             SET ingredient_id = ?, location_id = ?, quantity = ?, purchase_date = ?,
                 expiration_date = ?, unit_cost = ?
             WHERE id = ?`,
            [value.ingredient_id, value.location_id, value.quantity,
                value.purchase_date, value.expiration_date, value.unit_cost, id]
        );
        await connection.commit();
        res.json({ id, ...value });
    } catch (err) {
        if (connection) await connection.rollback();
        next(err);
    } finally {
        if (connection) connection.release();
    }
});

// DELETE /api/inventory/:id — for removing mistaken entries, NOT using up a purchase.
router.delete('/:id', async (req, res, next) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid inventory batch ID' });
        const [result] = await pool.query('DELETE FROM inventory_item WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Inventory batch not found' });
        }
        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

module.exports = router;
