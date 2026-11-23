//*** routes/tags.js — tag and recipe routes (Backend B)
//***
//*** Mount in index.js:   app.use('/api', require('./routes/tags'));
//***
//***   GET    /api/tags                 all tags
//***   GET    /api/tags?recipe_id=3     tags on one recipe
//***   GET    /api/tags/:id             one tag and its recipes
//***   GET    /api/recipes              list recipes (?search= &tag= &max_cost= &max_minutes=)
//***   GET    /api/recipes/:id          one recipe with ingredients, tags and cost
//***   POST   /api/recipes              create a recipe (one transaction)
//***   PUT    /api/recipes/:id          edit a recipe (one transaction)
//***   DELETE /api/recipes/:id          delete a recipe
//***
//*** Recipe fields for POST/PUT (form or JSON):
//***   title, description, servings, prep_minutes, cook_minutes, instructions,
//***   ingredient_id + quantity (repeat the pair once per ingredient),
//***   tag_id (repeat once per tag)


const express = require('express');
const router = express.Router();

// Requires the exported pool object from the local 'mysql.js' file
const pool = require('./mysql');
const { makeTable, makePage, errorPage, isId } = require('./helpers');



//*** Read and check the recipe fields sent by the browser (POST and PUT)

function readRecipe(body) {
    const recipe = {
        title: (body.title || '').trim(),
        description: body.description || null,
        servings: Number(body.servings),
        prep_minutes: Number(body.prep_minutes || 0),
        cook_minutes: Number(body.cook_minutes || 0),
        instructions: body.instructions || null,
        ingredients: [],
        tag_ids: []
    };

    // Ingredients: JSON list [{ ingredient_id, quantity }] or repeated form fields
    if (Array.isArray(body.ingredients)) {
        recipe.ingredients = body.ingredients.map(i => ({ id: i.ingredient_id, qty: i.quantity }));
    } else {
        const ids = [].concat(body.ingredient_id ?? []);
        const qtys = [].concat(body.quantity ?? []);
        recipe.ingredients = ids.map((id, n) => ({ id: id, qty: qtys[n] }));
    }
    recipe.tag_ids = [].concat(body.tag_ids ?? body.tag_id ?? []);

    // Basic checks before anything touches the database
    if (!recipe.title) return { error: "Title is required." };
    if (!isId(recipe.servings)) return { error: "Servings must be a whole number above 0." };
    if (recipe.ingredients.length === 0) return { error: "Add at least one ingredient." };
    for (const ing of recipe.ingredients) {
        if (!isId(ing.id) || !(Number(ing.qty) > 0)) {
            return { error: "Each ingredient needs a valid ingredient id and a quantity above 0." };
        }
    }
    for (const tagId of recipe.tag_ids) {
        if (!isId(tagId)) return { error: "Tag ids must be whole numbers." };
    }
    return { recipe: recipe };
}

// Insert ingredient and tag rows for a recipe (inside an open transaction)
async function insertLinks(conn, recipeId, recipe) {
    for (const ing of recipe.ingredients) {
        await conn.execute(
            "INSERT INTO recipe_ingredient (recipe_id, ingredient_id, quantity) VALUES (?, ?, ?)",
            [recipeId, ing.id, ing.qty]);
    }
    for (const tagId of recipe.tag_ids) {
        await conn.execute(
            "INSERT INTO recipe_tag (recipe_id, tag_id) VALUES (?, ?)",
            [recipeId, tagId]);
    }
}

// Build the full recipe page: details, ingredients, tags. Returns null if not found.
async function recipeTables(id) {
    const [recipe, recipeFields] = await pool.execute(
        `SELECT r.id, r.title, r.description, r.servings, r.prep_minutes, r.cook_minutes,
                r.instructions, c.total_cost, c.cost_per_serving
           FROM recipe r
           LEFT JOIN v_recipe_cost c ON c.recipe_id = r.id
          WHERE r.id = ?`, [id]);
    if (recipe.length === 0) return null;

    const [ingredients, ingFields] = await pool.execute(
        `SELECT i.name AS ingredient, ri.quantity, i.base_unit AS unit,
                COALESCE(s.total_qty, 0) AS on_hand,
                ROUND(ri.quantity * i.avg_price_per_unit, 2) AS est_cost
           FROM recipe_ingredient ri
           JOIN ingredient i              ON i.id = ri.ingredient_id
           LEFT JOIN v_ingredient_stock s ON s.ingredient_id = ri.ingredient_id
          WHERE ri.recipe_id = ?
          ORDER BY i.name`, [id]);

    const [tags, tagFields] = await pool.execute(
        `SELECT t.id, t.name
           FROM recipe_tag rt JOIN tag t ON t.id = rt.tag_id
          WHERE rt.recipe_id = ?
          ORDER BY t.name`, [id]);

    return makeTable("Recipe", recipe, recipeFields)
         + makeTable("Ingredients", ingredients, ingFields)
         + makeTable("Tags", tags, tagFields);
}


//*** TAGS

// GET /api/tags  an  GET /api/tags?recipe_id=3
router.get("/tags", async (req, res) => {
    const recipeId = req.query.recipe_id;

    try {
        let result, fields;
        if (recipeId !== undefined) {
            if (!isId(recipeId)) return errorPage(res, 400, "recipe_id must be a whole number.");

            // SECURITY: prepared statement (the '?' placeholder)
            [result, fields] = await pool.execute(
                `SELECT t.id, t.name
                   FROM tag t JOIN recipe_tag rt ON rt.tag_id = t.id
                  WHERE rt.recipe_id = ?
                  ORDER BY t.name`, [recipeId]);
        } else {
            [result, fields] = await pool.execute(
                `SELECT t.id, t.name, COUNT(rt.recipe_id) AS recipe_count
                   FROM tag t LEFT JOIN recipe_tag rt ON rt.tag_id = t.id
                  GROUP BY t.id, t.name
                  ORDER BY t.name`);
        }

        console.log("Tags listed", recipeId ? "for recipe " + recipeId : "");
        res.send(makePage(makeTable("Tags", result, fields)));
    } catch (err) {
        console.error("SQL Error in GET /tags:", err);
        errorPage(res, 500, "An error occurred while fetching tags.");
    }
});

// GET /api/tags/:id
router.get("/tags/:id", async (req, res) => {
    const id = req.params.id;
    if (!isId(id)) return errorPage(res, 400, "Tag id must be a whole number.");

    try {
        const [tag, tagFields] = await pool.execute("SELECT id, name FROM tag WHERE id = ?", [id]);
        if (tag.length === 0) return errorPage(res, 404, "Tag not found.");

        const [recipes, recipeFields] = await pool.execute(
            `SELECT r.id, r.title, r.servings,
                    r.prep_minutes + r.cook_minutes AS total_minutes, c.cost_per_serving
               FROM recipe_tag rt
               JOIN recipe r             ON r.id = rt.recipe_id
               LEFT JOIN v_recipe_cost c ON c.recipe_id = r.id
              WHERE rt.tag_id = ?
              ORDER BY r.title`, [id]);

        console.log("Tag shown:", tag[0].name);
        res.send(makePage(makeTable("Tag", tag, tagFields)
                        + makeTable("Recipes with this tag", recipes, recipeFields)));
    } catch (err) {
        console.error("SQL Error in GET /tags/:id:", err);
        errorPage(res, 500, "An error occurred while fetching the tag.");
    }
});


//*** RECIPES
//*** (Add /recipes/cookable and similar routes ABOVE /recipes/:id)

// GET /api/recipes?search=pasta&tag=Vegetarian&max_cost=3&max_minutes=30
router.get("/recipes", async (req, res) => {
    const { search, tag, max_cost, max_minutes } = req.query;

    // Build the WHERE clause from whichever filters were sent.
    // SECURITY: user values only ever go into the params list, never into the SQL text.
    const where = [];
    const params = [];
    if (search) {
        where.push("r.title LIKE ?");
        params.push('%' + search + '%');
    }
    if (tag) {
        where.push(`EXISTS (SELECT 1 FROM recipe_tag rt JOIN tag t ON t.id = rt.tag_id
                            WHERE rt.recipe_id = r.id AND t.name = ?)`);
        params.push(tag);
    }
    if (max_cost) {
        if (isNaN(max_cost)) return errorPage(res, 400, "max_cost must be a number.");
        where.push("c.cost_per_serving <= ?");
        params.push(max_cost);
    }
    if (max_minutes) {
        if (isNaN(max_minutes)) return errorPage(res, 400, "max_minutes must be a number.");
        where.push("r.prep_minutes + r.cook_minutes <= ?");
        params.push(max_minutes);
    }

    const sql_query =
        `SELECT r.id, r.title, r.servings,
                r.prep_minutes + r.cook_minutes AS total_minutes,
                c.cost_per_serving,
                (SELECT GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ', ')
                   FROM recipe_tag rt JOIN tag t ON t.id = rt.tag_id
                  WHERE rt.recipe_id = r.id) AS tags
           FROM recipe r
           LEFT JOIN v_recipe_cost c ON c.recipe_id = r.id
          ${where.length ? "WHERE " + where.join(" AND ") : ""}
          ORDER BY r.title`;

    try {
        const [result, fields] = await pool.execute(sql_query, params);
        console.log("Recipes listed with filters:", req.query);
        res.send(makePage(makeTable("Recipes", result, fields)));
    } catch (err) {
        console.error("SQL Error in GET /recipes:", err);
        errorPage(res, 500, "An error occurred while fetching recipes.");
    }
});

// GET /api/recipes/:id
router.get("/recipes/:id", async (req, res) => {
    const id = req.params.id;
    if (!isId(id)) return errorPage(res, 400, "Recipe id must be a whole number.");

    try {
        const tables = await recipeTables(id);
        if (!tables) return errorPage(res, 404, "Recipe not found.");

        console.log("Recipe shown:", id);
        res.send(makePage(tables));
    } catch (err) {
        console.error("SQL Error in GET /recipes/:id:", err);
        errorPage(res, 500, "An error occurred while fetching the recipe.");
    }
});

// POST /api/recipes
router.post("/recipes", async (req, res) => {
    const { recipe, error } = readRecipe(req.body);
    if (error) return errorPage(res, 400, error);

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // SECURITY: prepared statements (the '?' placeholder)
        const [insert] = await conn.execute(
            `INSERT INTO recipe (title, description, servings, prep_minutes, cook_minutes, instructions)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [recipe.title, recipe.description, recipe.servings,
             recipe.prep_minutes, recipe.cook_minutes, recipe.instructions]);
        await insertLinks(conn, insert.insertId, recipe);

        await conn.commit();
        console.log("Recipe added:", insert.insertId, recipe.title);

        // Show the new recipe
        res.redirect(`${req.baseUrl}/recipes/${insert.insertId}`);
    } catch (err) {
        await conn.rollback();   // undo everything if any insert failed
        console.error("SQL Error in POST /recipes:", err);
        errorPage(res, 400, "The recipe could not be added. Check that the ingredient and tag ids exist.");
    } finally {
        conn.release();
    }
});

// PUT /api/recipes/:id  (replaces the recipe, its ingredients and its tags)
router.put("/recipes/:id", async (req, res) => {
    const id = req.params.id;
    if (!isId(id)) return errorPage(res, 400, "Recipe id must be a whole number.");

    const { recipe, error } = readRecipe(req.body);
    if (error) return errorPage(res, 400, error);

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [update] = await conn.execute(
            `UPDATE recipe
                SET title = ?, description = ?, servings = ?,
                    prep_minutes = ?, cook_minutes = ?, instructions = ?
              WHERE id = ?`,
            [recipe.title, recipe.description, recipe.servings,
             recipe.prep_minutes, recipe.cook_minutes, recipe.instructions, id]);
        if (update.affectedRows === 0) {
            await conn.rollback();
            return errorPage(res, 404, "Recipe not found.");
        }

        await conn.execute("DELETE FROM recipe_ingredient WHERE recipe_id = ?", [id]);
        await conn.execute("DELETE FROM recipe_tag WHERE recipe_id = ?", [id]);
        await insertLinks(conn, id, recipe);

        await conn.commit();
        console.log("Recipe updated:", id, recipe.title);
        res.send(makePage("<H1>Recipe updated</H1>" + await recipeTables(id)));
    } catch (err) {
        await conn.rollback();
        console.error("SQL Error in PUT /recipes/:id:", err);
        errorPage(res, 400, "The recipe could not be updated. Check that the ingredient and tag ids exist.");
    } finally {
        conn.release();
    }
});

// DELETE /api/recipes/:id
router.delete("/recipes/:id", async (req, res) => {
    const id = req.params.id;
    if (!isId(id)) return errorPage(res, 400, "Recipe id must be a whole number.");

    try {
        // Get the recipe first so the page can show what was deleted
        const tables = await recipeTables(id);
        if (!tables) return errorPage(res, 404, "Recipe not found.");

        // Its recipe_ingredient, recipe_tag and cook_log rows are removed by ON DELETE CASCADE
        await pool.execute("DELETE FROM recipe WHERE id = ?", [id]);

        console.log("Recipe deleted:", id);
        res.send(makePage("<H1>Recipe deleted</H1>" + tables));
    } catch (err) {
        console.error("SQL Error in DELETE /recipes/:id:", err);
        errorPage(res, 500, "An error occurred while deleting the recipe.");
    }
});

module.exports = router;
