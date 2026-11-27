-- Views used by the recipe routes (src/recipe.js). Run after schema.sql:
--   mysql -u root -p < views.sql
USE kitchen;

-- Amount on hand per ingredient, summed across all batches
CREATE OR REPLACE VIEW v_ingredient_stock AS
SELECT ingredient_id, SUM(quantity) AS total_qty
  FROM inventory_item
 GROUP BY ingredient_id;

-- Estimated cost of each recipe, from the ingredients' average prices
CREATE OR REPLACE VIEW v_recipe_cost AS
SELECT r.id AS recipe_id,
       ROUND(COALESCE(SUM(ri.quantity * i.avg_price_per_unit), 0), 2) AS total_cost,
       ROUND(COALESCE(SUM(ri.quantity * i.avg_price_per_unit), 0) / r.servings, 2) AS cost_per_serving
  FROM recipe r
  LEFT JOIN recipe_ingredient ri ON ri.recipe_id = r.id
  LEFT JOIN ingredient i         ON i.id = ri.ingredient_id
 GROUP BY r.id, r.servings;
