const express = require('express');
const pool = require('../mysql');
const router = express.Router();

// GET /api/categories
router.get('/categories', async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT id, name FROM category ORDER BY name');
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// GET /api/locations
router.get('/locations', async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT id, name FROM storage_location ORDER BY name');
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
