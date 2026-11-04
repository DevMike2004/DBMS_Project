-- Load the CSV files into the kitchen database (run schema.sql first).
-- Run from the folder that contains the CSVs:
--   mysql --local-infile=1 -u root -p < load_csv.sql
-- If you get "Loading local data is disabled", run once as root:
--   SET GLOBAL local_infile = 1;
USE kitchen;

LOAD DATA LOCAL INFILE '01_category.csv' INTO TABLE category
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n' IGNORE 1 LINES
  (id, name);

LOAD DATA LOCAL INFILE '02_storage_location.csv' INTO TABLE storage_location
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n' IGNORE 1 LINES
  (id, name);

LOAD DATA LOCAL INFILE '03_tag.csv' INTO TABLE tag
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n' IGNORE 1 LINES
  (id, name);

LOAD DATA LOCAL INFILE '04_ingredient.csv' INTO TABLE ingredient
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n' IGNORE 1 LINES
  (id, name, category_id, base_unit, avg_price_per_unit);

-- Empty cells become NULL (no expiration / unknown cost)
LOAD DATA LOCAL INFILE '05_inventory_item.csv' INTO TABLE inventory_item
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n' IGNORE 1 LINES
  (id, ingredient_id, location_id, quantity, purchase_date, @exp, @cost)
  SET expiration_date = NULLIF(@exp, ''), unit_cost = NULLIF(@cost, '');

LOAD DATA LOCAL INFILE '06_recipe.csv' INTO TABLE recipe
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n' IGNORE 1 LINES
  (id, title, description, servings, prep_minutes, cook_minutes, instructions, created_at);

LOAD DATA LOCAL INFILE '07_recipe_ingredient.csv' INTO TABLE recipe_ingredient
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n' IGNORE 1 LINES
  (recipe_id, ingredient_id, quantity);

LOAD DATA LOCAL INFILE '08_recipe_tag.csv' INTO TABLE recipe_tag
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n' IGNORE 1 LINES
  (recipe_id, tag_id);

LOAD DATA LOCAL INFILE '09_cook_log.csv' INTO TABLE cook_log
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n' IGNORE 1 LINES
  (id, recipe_id, cooked_at);
