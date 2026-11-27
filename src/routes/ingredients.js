const express = require('express');
const pool = require('../mysql');
const { parseId, parseDecimal, isBody, hasOnlyFields } = require('../utils/validation');
const router = express.Router();

const FIELDS = ['name', 'category_id', 'base_unit', 'avg_price_per_unit'];
const UNITS = ['g', 'ml', 'each'];

function validateIngredient(data) {
    if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 100) {
        return { error: 'name must contain 1–100 characters' };
    }
    const categoryId = parseId(data.category_id);
    if (!categoryId) return { error: 'category_id must be a positive integer' };
    if (!UNITS.includes(data.base_unit)) return { error: 'base_unit must be g, ml, or each' };
    const price = parseDecimal(data.avg_price_per_unit, { scale: 4 });
    if (price === null) return { error: 'avg_price_per_unit must be a nonnegative DECIMAL(10,4)' };
    return {
        value: {
            name: data.name.trim(),
            category_id: categoryId,
            base_unit: data.base_unit,
            avg_price_per_unit: price
        }
    };
}

// GET /api/ingredients[?q=milk] — total usable stock for each ingredient.
router.get('/', async (req, res, next) => {
    try {
        if (req.query.q !== undefined && typeof req.query.q !== 'string') {
            return res.status(400).json({ error: 'q must be a string' });
        }
        const search = (req.query.q || '').trim();
        // Escape SQL LIKE wildcards so input is treated as literal search text.
        const pattern = `%${search.replace(/[!%_]/g, char => '!' + char)}%`;
        const [rows] = await pool.query(
            `SELECT i.id, i.name, i.category_id, c.name AS category,
                    i.base_unit, i.avg_price_per_unit,
                    COALESCE(s.quantity_on_hand, 0) AS quantity_on_hand
             FROM ingredient i
             JOIN category c ON c.id = i.category_id
             LEFT JOIN (
                 SELECT ingredient_id, SUM(quantity) AS quantity_on_hand
                 FROM inventory_item
                 WHERE quantity > 0
                   AND (expiration_date IS NULL OR expiration_date >= CURDATE())
                 GROUP BY ingredient_id
             ) s ON s.ingredient_id = i.id
             WHERE i.name LIKE ? ESCAPE '!'
             ORDER BY i.name`,
            [pattern]
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// GET /api/ingredients/:id — metadata and every historical batch (including zero quantity).
router.get('/:id', async (req, res, next) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid ingredient ID' });

        const [ingredients] = await pool.query(
            `SELECT i.id, i.name, i.category_id, c.name AS category,
                    i.base_unit, i.avg_price_per_unit
             FROM ingredient i JOIN category c ON c.id = i.category_id
             WHERE i.id = ?`,
            [id]
        );
        if (ingredients.length === 0) {
            return res.status(404).json({ error: 'Ingredient not found' });
        }

        const [batches] = await pool.query(
            `SELECT b.id, b.ingredient_id, b.location_id, l.name AS location,
                    b.quantity, b.purchase_date, b.expiration_date, b.unit_cost
             FROM inventory_item b
             JOIN storage_location l ON l.id = b.location_id
             WHERE b.ingredient_id = ?
             ORDER BY b.expiration_date IS NULL, b.expiration_date, b.purchase_date, b.id`,
            [id]
        );
        res.json({ ...ingredients[0], batches });
    } catch (err) {
        next(err);
    }
});

// POST /api/ingredients
router.post('/', async (req, res, next) => {
    try {
        if (!isBody(req.body) || !hasOnlyFields(req.body, FIELDS)) {
            return res.status(400).json({ error: 'Invalid ingredient fields' });
        }
        const { error, value } = validateIngredient({ avg_price_per_unit: 0, ...req.body });
        if (error) return res.status(400).json({ error });

        const [result] = await pool.query(
            `INSERT INTO ingredient (name, category_id, base_unit, avg_price_per_unit)
             VALUES (?, ?, ?, ?)`,
            [value.name, value.category_id, value.base_unit, value.avg_price_per_unit]
        );
        res.status(201).json({ id: result.insertId, ...value });
    } catch (err) {
        next(err);
    }
});

// PUT /api/ingredients/:id — supports updating one or more editable fields.
router.put('/:id', async (req, res, next) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid ingredient ID' });
    if (!isBody(req.body) || !hasOnlyFields(req.body, FIELDS)) {
        return res.status(400).json({ error: 'Supply one or more editable ingredient fields' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [existing] = await connection.query(
            'SELECT name, category_id, base_unit, avg_price_per_unit FROM ingredient WHERE id = ? FOR UPDATE',
            [id]
        );
        if (existing.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Ingredient not found' });
        }

        const { error, value } = validateIngredient({ ...existing[0], ...req.body });
        if (error) {
            await connection.rollback();
            return res.status(400).json({ error });
        }

        if (value.base_unit !== existing[0].base_unit) {
            // Changing units would make existing recipe and inventory quantities incorrect.
            const [usage] = await connection.query(
                `SELECT EXISTS(SELECT 1 FROM inventory_item WHERE ingredient_id = ?) AS in_inventory,
                        EXISTS(SELECT 1 FROM recipe_ingredient WHERE ingredient_id = ?) AS in_recipe`,
                [id, id]
            );
            if (usage[0].in_inventory || usage[0].in_recipe) {
                await connection.rollback();
                return res.status(409).json({
                    error: 'Cannot change base_unit while inventory or recipes reference the ingredient'
                });
            }
        }

        await connection.query(
            `UPDATE ingredient
             SET name = ?, category_id = ?, base_unit = ?, avg_price_per_unit = ?
             WHERE id = ?`,
            [value.name, value.category_id, value.base_unit, value.avg_price_per_unit, id]
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

// DELETE /api/ingredients/:id — recipe_ingredient FK enforces ON DELETE RESTRICT.
router.delete('/:id', async (req, res, next) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid ingredient ID' });
        const [result] = await pool.query('DELETE FROM ingredient WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Ingredient not found' });
        }
        // Deleting an ingredient also cascades to its inventory history per schema.sql.
        res.status(204).end();
    } catch (err) {
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(409).json({ error: 'Ingredient is used by a recipe and cannot be deleted' });
        }
        next(err);
    }
});

module.exports = router;
