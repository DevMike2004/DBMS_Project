-- =============================================================
-- At-Home Recipe Finder — tables
-- MySQL 8.0.16+ (needed for CHECK constraints)
-- Creates the database and its tables only.
-- =============================================================

DROP DATABASE IF EXISTS kitchen;
CREATE DATABASE kitchen;
USE kitchen;

-- -------------------------------------------------------------
-- Lookup tables
-- -------------------------------------------------------------
CREATE TABLE category (
    id    INT AUTO_INCREMENT PRIMARY KEY,
    name  VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE storage_location (
    id    INT AUTO_INCREMENT PRIMARY KEY,
    name  VARCHAR(50) NOT NULL UNIQUE          -- Pantry, Fridge, Freezer
);

CREATE TABLE tag (
    id    INT AUTO_INCREMENT PRIMARY KEY,
    name  VARCHAR(50) NOT NULL UNIQUE          -- Breakfast, Vegetarian, Quick...
);

-- -------------------------------------------------------------
-- Ingredients
-- Every quantity in the database is stored in the ingredient's
-- base unit (g, ml, or each). That keeps the math simple; a unit
-- conversion table (cups -> ml, etc.) is a good later extension.
-- -------------------------------------------------------------
CREATE TABLE ingredient (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(100) NOT NULL UNIQUE,
    category_id         INT NOT NULL,
    base_unit           ENUM('g', 'ml', 'each') NOT NULL,
    avg_price_per_unit  DECIMAL(10,4) NOT NULL DEFAULT 0,
    CONSTRAINT fk_ingredient_category
        FOREIGN KEY (category_id) REFERENCES category(id)
        ON DELETE RESTRICT
);

-- -------------------------------------------------------------
-- Inventory: one row per purchased batch, so two cartons of milk
-- with different expiration dates are two rows. Batches that get
-- used up stay at quantity 0 so their price history is kept.
-- -------------------------------------------------------------
CREATE TABLE inventory_item (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    ingredient_id    INT NOT NULL,
    location_id      INT NOT NULL,
    quantity         DECIMAL(10,2) NOT NULL,
    purchase_date    DATE NOT NULL DEFAULT (CURRENT_DATE),
    expiration_date  DATE NULL,                        -- NULL = doesn't expire
    unit_cost        DECIMAL(10,4) NULL,               -- price paid per base unit
    CONSTRAINT chk_inventory_qty CHECK (quantity >= 0),
    CONSTRAINT fk_inventory_ingredient
        FOREIGN KEY (ingredient_id) REFERENCES ingredient(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_inventory_location
        FOREIGN KEY (location_id) REFERENCES storage_location(id)
        ON DELETE RESTRICT
);

CREATE INDEX idx_inventory_expiration ON inventory_item (expiration_date);
CREATE INDEX idx_inventory_ingredient_qty ON inventory_item (ingredient_id, quantity);

-- -------------------------------------------------------------
-- Recipes
-- -------------------------------------------------------------
CREATE TABLE recipe (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    title         VARCHAR(150) NOT NULL,
    description   VARCHAR(500),
    servings      INT NOT NULL DEFAULT 1,
    prep_minutes  INT NOT NULL DEFAULT 0,
    cook_minutes  INT NOT NULL DEFAULT 0,
    instructions  TEXT,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_recipe_servings CHECK (servings > 0)
);

-- Many-to-many: which ingredients a recipe needs, and how much
CREATE TABLE recipe_ingredient (
    recipe_id      INT NOT NULL,
    ingredient_id  INT NOT NULL,
    quantity       DECIMAL(10,2) NOT NULL,             -- in ingredient's base unit
    PRIMARY KEY (recipe_id, ingredient_id),
    CONSTRAINT chk_ri_qty CHECK (quantity > 0),
    CONSTRAINT fk_ri_recipe
        FOREIGN KEY (recipe_id) REFERENCES recipe(id)
        ON DELETE CASCADE,                             -- delete recipe -> drop its lines
    CONSTRAINT fk_ri_ingredient
        FOREIGN KEY (ingredient_id) REFERENCES ingredient(id)
        ON DELETE RESTRICT                             -- can't delete an ingredient a recipe uses
);

CREATE TABLE recipe_tag (
    recipe_id  INT NOT NULL,
    tag_id     INT NOT NULL,
    PRIMARY KEY (recipe_id, tag_id),
    FOREIGN KEY (recipe_id) REFERENCES recipe(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id)    REFERENCES tag(id)    ON DELETE CASCADE
);

-- History of what was cooked (feeds "most cooked" reports later)
CREATE TABLE cook_log (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    recipe_id  INT NOT NULL,
    cooked_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipe_id) REFERENCES recipe(id) ON DELETE CASCADE
);
