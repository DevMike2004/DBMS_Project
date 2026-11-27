const express = require('express');
const pool = require('../mysql');
const { parseId } = require('../utils/validation');
const router = express.Router();

// GET /api/shopping-list?recipe_ids=1,2
// Each selected recipe is prepared once; this endpoint does not alter inventory.
router.get('/', async (req, res, next) => {
    try {
        const raw = req.query.recipe_ids;
        if (typeof raw !== 'string' || !raw.trim()) {
            return res.status(400).json({ error: 'recipe_ids is required (e.g. 1,2)' });
        }
        const parts = raw.split(',');
        if (parts.length > 50) {
            return res.status(400).json({ error: 'Select at most 50 recipe IDs' });
        }
        const parsed = parts.map(part => parseId(part));
        if (parsed.some(id => id === null)) {
            return res.status(400).json({ error: 'recipe_ids must contain positive integer IDs' });
        }
        const ids = [...new Set(parsed)];
        const placeholders = ids.map(() => '?').join(', ');

        const [recipes] = await pool.query(
            `SELECT id FROM recipe WHERE id IN (${placeholders})`, ids
        );
        if (recipes.length !== ids.length) {
            return res.status(404).json({ error: 'One or more recipes not found' });
        }

        // Sum recipe requirements BEFORE joining stock, avoiding multiplication
        // when an ingredient is present in multiple recipes AND multiple batches.
        const [items] = await pool.query(
            `WITH needed AS (
                SELECT ingredient_id, SUM(quantity) AS required_quantity
                FROM recipe_ingredient
                WHERE recipe_id IN (${placeholders})
                GROUP BY ingredient_id
             ), on_hand AS (
                SELECT ingredient_id, SUM(quantity) AS available_quantity
                FROM inventory_item
                WHERE quantity > 0
                  AND (expiration_date IS NULL OR expiration_date >= CURDATE())
                GROUP BY ingredient_id
             )
             SELECT i.id AS ingredient_id, i.name, i.base_unit,
                    n.required_quantity,
                    COALESCE(h.available_quantity, 0) AS available_quantity,
                    GREATEST(n.required_quantity - COALESCE(h.available_quantity, 0), 0)
                        AS missing_quantity,
                    i.avg_price_per_unit,
                    ROUND(GREATEST(n.required_quantity - COALESCE(h.available_quantity, 0), 0)
                          * i.avg_price_per_unit, 2) AS estimated_cost
             FROM needed n
             JOIN ingredient i ON i.id = n.ingredient_id
             LEFT JOIN on_hand h ON h.ingredient_id = n.ingredient_id
             WHERE n.required_quantity > COALESCE(h.available_quantity, 0)
             ORDER BY i.name`,
            ids
        );

        // mysql2 returns DECIMAL values as strings; total costs in integer cents.
        const totalCents = items.reduce((sum, item) => {
            const [whole, decimal = ''] = String(item.estimated_cost).split('.');
            return sum + BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0').slice(0, 2));
        }, 0n);
        const totalEstimatedCost = `${totalCents / 100n}.${String(totalCents % 100n).padStart(2, '0')}`;

        res.json({ recipe_ids: ids, items, total_estimated_cost: totalEstimatedCost });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
