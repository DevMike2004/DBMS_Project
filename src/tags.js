// routes/tags.js — GET endpoints for recipe tags (Backend B)
//
// Mount in server.js:
//   app.use('/api/tags', require('./routes/tags'));
//
// Endpoints:
//   GET /api/tags                 all tags, with how many recipes use each
//   GET /api/tags?recipe_id=3     only the tags on one recipe
//   GET /api/tags/:id             one tag, with the recipes that have it

const express = require('express');
const pool = require('./mysql');

const router = express.Router();

// Returns a positive integer, or null if the value isn't one
function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/tags  and  GET /api/tags?recipe_id=3
router.get('/', async (req, res, next) => {
  try {
    if (req.query.recipe_id !== undefined) {
      const recipeId = toId(req.query.recipe_id);
      if (!recipeId) return res.status(400).json({ error: 'recipe_id must be a positive integer' });

      const [recipe] = await pool.query('SELECT id FROM recipe WHERE id = ?', [recipeId]);
      if (recipe.length === 0) return res.status(404).json({ error: 'Recipe not found' });

      const [rows] = await pool.query(
        `SELECT t.id, t.name
           FROM tag t
           JOIN recipe_tag rt ON rt.tag_id = t.id
          WHERE rt.recipe_id = ?
          ORDER BY t.name`,
        [recipeId]
      );
      return res.json(rows);
    }

    const [rows] = await pool.query(
      `SELECT t.id, t.name, COUNT(rt.recipe_id) AS recipe_count
         FROM tag t
         LEFT JOIN recipe_tag rt ON rt.tag_id = t.id
        GROUP BY t.id, t.name
        ORDER BY t.name`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/tags/:id
router.get('/:id', async (req, res, next) => {
  try {
    const tagId = toId(req.params.id);
    if (!tagId) return res.status(400).json({ error: 'Tag id must be a positive integer' });

    const [tags] = await pool.query('SELECT id, name FROM tag WHERE id = ?', [tagId]);
    if (tags.length === 0) return res.status(404).json({ error: 'Tag not found' });

    const [recipes] = await pool.query(
      `SELECT r.id, r.title, r.servings,
              r.prep_minutes + r.cook_minutes AS total_minutes,
              c.cost_per_serving
         FROM recipe_tag rt
         JOIN recipe r          ON r.id = rt.recipe_id
         LEFT JOIN v_recipe_cost c ON c.recipe_id = r.id
        WHERE rt.tag_id = ?
        ORDER BY r.title`,
      [tagId]
    );

    res.json({ ...tags[0], recipes });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
