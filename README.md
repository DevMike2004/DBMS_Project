# At-Home Recipe Finder: Responsibilities

Who is working on what. If you need to change something in someone else's area (an endpoint's URL or response, or the schema), check with them first.

(File names and web routes don't necessarily have to be what they are here. They are just descriptors for what the step does)

| Role | Name | Area |
|---|---|---|
| Frontend | Hailey | All pages in the web client |
| Backend A | Brennan | Pantry and shopping |
| Backend B | Mike | Recipes, cooking, and reports |

---

## Shared (Backend A + B)

- [ ] Express server setup and route mounting
- [ ] MySQL connection pool
- [ ] Common error response format (`{ "error": "message" }`)

---

## Frontend

Build each page and connect it to the endpoints listed beside it.

- [ ] **Home**: cookable recipes, "almost there" recipes, expiring soon, use-it-up suggestions
  - Uses `GET /api/recipes/cookable`, `GET /api/recipes/almost`, `GET /api/inventory/expiring`, `GET /api/recipes/use-it-up`
- [ ] **Pantry**: view inventory by location; add, edit and remove batches and ingredients
  - Uses `GET /api/inventory`, `GET /api/locations`, `GET /api/categories`, `GET /api/ingredients`, `POST/PUT/DELETE /api/inventory`, `POST/PUT/DELETE /api/ingredients`
- [ ] **Recipe browser**: list recipes with search and filters (tag, cost, time)
  - Uses `GET /api/recipes`, `GET /api/tags`
- [ ] **Recipe detail**: ingredients needed vs. on hand, cost, tags, and a Cook button
  - Uses `GET /api/recipes/:id`, `POST /api/recipes/:id/cook`
- [ ] **Recipe editor**: create, edit and delete recipes
  - Uses `GET /api/ingredients`, `GET /api/tags`, `GET /api/recipes/:id`, `POST /api/recipes`, `PUT /api/recipes/:id`, `DELETE /api/recipes/:id`
- [ ] **Shopping list**: what to buy for selected recipes, with estimated cost
  - Uses `GET /api/shopping-list`
- [ ] **Reports**: most cooked, spending by month, price history, recent cooks
  - Uses `GET /api/reports/most-cooked`, `GET /api/reports/spending`, `GET /api/reports/price-history/:ingredientId`, `GET /api/cook-log`
- [ ] Show error messages from the API to the user (for example, "Not enough ingredients" when cooking fails)

---

## Backend A: Pantry and shopping

**Lookups**
- [ ] `GET /api/categories`: list categories
- [ ] `GET /api/locations`: list storage locations

**Ingredients**
- [ ] `GET /api/ingredients`: list or search ingredients, with amount on hand
- [ ] `GET /api/ingredients/:id`: one ingredient with its batches
- [ ] `POST /api/ingredients`: add an ingredient
- [ ] `PUT /api/ingredients/:id`: edit an ingredient
- [ ] `DELETE /api/ingredients/:id`: delete an ingredient (blocked if a recipe uses it)

**Inventory**
- [ ] `GET /api/inventory`: on-hand batches, by location
- [ ] `POST /api/inventory`: add a purchase
- [ ] `PUT /api/inventory/:id`: edit a batch
- [ ] `DELETE /api/inventory/:id`: remove a batch
- [ ] `GET /api/inventory/expiring`: batches expiring within N days

**Shopping**
- [ ] `GET /api/shopping-list`: combined list of missing ingredients for one or more recipes, with estimated cost

---

## Backend B: Recipes, cooking, and reports

**Recipes**
- [ ] `GET /api/tags`: list tags
- [ ] `GET /api/recipes`: list recipes with search and filters (tag, max cost, max time)
- [ ] `GET /api/recipes/:id`: one recipe with ingredients, tags and cost
- [ ] `POST /api/recipes`: create a recipe with its ingredients and tags (one transaction)
- [ ] `PUT /api/recipes/:id`: edit a recipe (one transaction)
- [ ] `DELETE /api/recipes/:id`: delete a recipe

**Finding recipes**
- [ ] `GET /api/recipes/cookable`: recipes you can make right now
- [ ] `GET /api/recipes/almost`: recipes missing only 1 or 2 ingredients
- [ ] `GET /api/recipes/use-it-up`: recipes that use ingredients expiring soon

**Cooking**
- [ ] `POST /api/recipes/:id/cook`: cook a recipe using the `cook_recipe` procedure (fails without changes if anything is short)
- [ ] `GET /api/cook-log`: recently cooked recipes

**Reports**
- [ ] `GET /api/reports/most-cooked`: recipes ranked by times cooked
- [ ] `GET /api/reports/spending`: spending per month
- [ ] `GET /api/reports/price-history/:ingredientId`: price of each purchase over time
