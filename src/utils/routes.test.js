// Unit-test HTTP handler behavior without requiring a MySQL server or external test library.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

function loadRouter(file, pool) {
    const routes = new Map();
    const router = {
        get: (pattern, handler) => routes.set(`GET ${pattern}`, handler),
        post: (pattern, handler) => routes.set(`POST ${pattern}`, handler),
        put: (pattern, handler) => routes.set(`PUT ${pattern}`, handler),
        delete: (pattern, handler) => routes.set(`DELETE ${pattern}`, handler)
    };
    const filename = path.join(__dirname, '..', 'routes', file);
    delete require.cache[require.resolve(filename)];
    const originalLoad = Module._load;
    try {
        Module._load = function(request, parent, isMain) {
            if (request === 'express') return { Router: () => router };
            if (request === '../mysql') return pool;
            return originalLoad.apply(this, arguments);
        };
        require(filename);
    } finally {
        Module._load = originalLoad;
    }
    return routes;
}

async function invoke(handler, { params = {}, query = {}, body = {} } = {}) {
    const response = {
        statusCode: 200, data: undefined, ended: false,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.data = data; return this; },
        end() { this.ended = true; return this; }
    };
    let error;
    await handler({ params, query, body }, response, err => { error = err; });
    if (error) throw error;
    return response;
}

test('lookup endpoint reads categories from the correct database table', async () => {
    const calls = [];
    const pool = { query: async (...args) => { calls.push(args); return [[{id:1,name:'Baking'}]]; } };
    const routes = loadRouter('lookups.js', pool);
    const res = await invoke(routes.get('GET /categories'));
    assert.deepEqual(res.data, [{ id: 1, name: 'Baking' }]);
    assert.match(calls[0][0], /FROM category/);
    assert.ok(routes.has('GET /locations'));
});

test('ingredient list sums only unexpired, positive inventory and escapes wildcard searches', async () => {
    let observed;
    const pool = { query: async (...args) => { observed = args; return [[{ id:1, name:'Milk', quantity_on_hand:'250.00' }]]; } };
    const handler = loadRouter('ingredients.js', pool).get('GET /');
    const res = await invoke(handler, { query: { q: 'milk_100%' } });
    assert.equal(res.statusCode, 200);
    assert.equal(observed[1][0], '%milk!_100!%%');
    assert.match(observed[0], /SUM\(quantity\)/);
    assert.match(observed[0], /expiration_date >= CURDATE\(\)/);
    assert.match(observed[0], /LIKE \? ESCAPE '!'/);
});

test('ingredient details include historical batches', async () => {
    let n = 0;
    const pool = { query: async () => (++n === 1 ? [[{id:13,name:'Egg'}]] : [[{id:5,quantity:'0.00'}]]) };
    const handler = loadRouter('ingredients.js', pool).get('GET /:id');
    const res = await invoke(handler, { params: { id:'13' } });
    assert.equal(res.data.id, 13);
    assert.deepEqual(res.data.batches, [{id:5,quantity:'0.00'}]);
});

test('ingredient POST validates input and returns 201 for successful insert', async () => {
    let calls = 0;
    const pool = { query: async () => { ++calls; return [{insertId:300}]; } };
    const handler = loadRouter('ingredients.js', pool).get('POST /');
    const invalid = await invoke(handler, { body: {name:'Bad',category_id:1,base_unit:'cups'} });
    assert.equal(invalid.statusCode, 400);
    assert.equal(calls, 0);
    const good = await invoke(handler, {
        body:{name:'Cornstarch',category_id:1,base_unit:'g',avg_price_per_unit:'0.0045'}
    });
    assert.equal(good.statusCode, 201);
    assert.equal(good.data.id, 300);
});

test('ingredient base-unit changes are blocked when stock or recipes exist', async () => {
    const pool = {
        getConnection: async () => ({
            beginTransaction: async () => {}, rollback: async () => {},
            release: () => {},
            query: async sql => sql.includes('FOR UPDATE')
                ? [[{name:'Flour',category_id:1,base_unit:'g',avg_price_per_unit:'0.0040'}]]
                : [[{in_inventory:1,in_recipe:0}]]
        })
    };
    const handler = loadRouter('ingredients.js', pool).get('PUT /:id');
    const res = await invoke(handler, {params:{id:'2'},body:{base_unit:'each'}});
    assert.equal(res.statusCode, 409);
});

test('inventory list allows location filter and reports expired batches', async () => {
    let observed;
    const pool = { query: async (...args) => { observed = args; return [[{id:2,is_expired:1}]]; } };
    const handler = loadRouter('inventory.js', pool).get('GET /');
    const res = await invoke(handler, {query:{location_id:'2'}});
    assert.deepEqual(observed[1], [2, 2]);
    assert.match(observed[0], /CASE WHEN b.expiration_date < CURDATE\(\)/);
    assert.equal(res.data[0].is_expired, 1);
});

test('expiring batches accept days 0 through 365 only', async () => {
    let observed;
    const pool = { query: async (...args) => { observed = args; return [[]]; } };
    const handler = loadRouter('inventory.js', pool).get('GET /expiring');
    const good = await invoke(handler, {query:{days:'0'}});
    assert.equal(good.statusCode, 200);
    assert.deepEqual(observed[1], [0]);
    const bad = await invoke(handler, {query:{days:'366'}});
    assert.equal(bad.statusCode, 400);
});

test('inventory POST retains a new batch and rejects zero-quantity purchases', async () => {
    let n = 0;
    const pool = {query: async () => (++n === 1 ? [{insertId:500}] : [[{id:500,quantity:'6.00'}]])};
    const handler = loadRouter('inventory.js', pool).get('POST /');
    const bad = await invoke(handler, {body:{ingredient_id:1, location_id:1, quantity:0}});
    assert.equal(bad.statusCode, 400);
    const good = await invoke(handler, {body:{ingredient_id:1,location_id:1,quantity:6}});
    assert.equal(good.statusCode, 201);
    assert.equal(good.data.id, 500);
});

test('shopping combines recipe shortages, respects missing recipes, and sums exact cents', async () => {
    let sql;
    const pool = { query: async (statement, params) => {
        if (statement.startsWith('SELECT id FROM recipe')) return [[{id:1},{id:2}]];
        sql = statement;
        assert.deepEqual(params, [1,2]);
        return [[
            {name:'Egg', estimated_cost:'0.70'},
            {name:'Milk', estimated_cost:'1.25'}
        ]];
    }};
    const handler = loadRouter('shopping.js', pool).get('GET /');
    const res = await invoke(handler, { query:{recipe_ids:'1,2,1'} });
    assert.equal(res.data.total_estimated_cost, '1.95');
    assert.deepEqual(res.data.recipe_ids, [1,2]);
    assert.match(sql, /WITH needed AS/);
    assert.match(sql, /GROUP BY ingredient_id/);
    assert.match(sql, /expiration_date >= CURDATE\(\)/);
    assert.equal((await invoke(handler, {query:{recipe_ids:'bad'}})).statusCode, 400);
});

test('inventory PUT preserves existing fields and allows a depleted batch', async () => {
    let updateArgs;
    let committed = false;
    const pool = {
        getConnection: async () => ({
            beginTransaction: async () => {},
            rollback: async () => {},
            commit: async () => { committed = true; },
            release: () => {},
            query: async (sql, params) => {
                if (sql.includes('FOR UPDATE')) return [[{
                    ingredient_id: 13, location_id: 2, quantity: '6.00',
                    purchase_date: '2026-11-20', expiration_date: '2026-12-05', unit_cost: '0.3500'
                }]];
                updateArgs = params;
                return [{ affectedRows: 1 }];
            }
        })
    };
    const handler = loadRouter('inventory.js', pool).get('PUT /:id');
    const res = await invoke(handler, { params: { id:'4' }, body: { quantity:'0.00' } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.data.quantity, '0.00');
    assert.equal(res.data.ingredient_id, 13);
    assert.equal(updateArgs.at(-1), 4);
    assert.equal(committed, true);
});

test('shopping rejects selections containing nonexistent recipes', async () => {
    let queries = 0;
    const pool = { query: async () => { ++queries; return [[{id:1}]]; } };
    const handler = loadRouter('shopping.js', pool).get('GET /');
    const res = await invoke(handler, { query:{recipe_ids:'1,400'} });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.data, {error:'One or more recipes not found'});
    assert.equal(queries, 1);
});
