//*** server.js — main entry point. Run with:  node server.js   (from the src folder or anywhere)
//***
//***   /                 -> homepage.html
//***   /<page>.html      -> that page from src/ (placeholder.html if it isn't built yet)
//***   /css/...          -> stylesheets
//***   /api/...          -> API routes (Backend B: recipe.js, Backend A: routes/)

const express = require('express');
const fsp = require("fs").promises; // Use fs/promises for async/await file operations
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Requires the exported pool object from the local 'mysql.js' file
// (requiring it here also runs the connection check at startup)
const pool = require('./mysql');

//*** create form parser
// Using express's built-in body parser for simplicity and consistency
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Lets HTML forms send PUT/DELETE: <form method="POST" action="/api/recipes/3?_method=DELETE">
app.use((req, res, next) => {
    const override = (req.query._method || '').toUpperCase();
    if (req.method === 'POST' && (override === 'PUT' || override === 'DELETE')) {
        req.method = override;
    }
    next();
});

//*** STATIC FILES
// Only the css folder is served as-is, so server code (mysql.js has the DB password) is never sent to the browser
app.use('/css', express.static(path.join(__dirname, 'css')));

async function readAndServe(filePath, res) {
    try {
        const data = await fsp.readFile(filePath);
        res.setHeader('Content-Type', 'text/html');
        res.end(data);
    } catch (err) {
        console.error("File Read Error:", err);
        res.status(404).send("<html><body><h1>404 Not Found</h1><p>The page could not be served.</p></body></html>");
    }
}

//*** PAGES
app.get("/", async (req, res) => {
    await readAndServe(path.join(__dirname, "homepage.html"), res);
});

// Any page in the nav bar; pages not built yet show the placeholder
app.get("/:page.html", async (req, res) => {
    const page = req.params.page;
    if (!/^[\w-]+$/.test(page)) return res.status(404).send("Not found");   // no ../ tricks

    const file = path.join(__dirname, page + ".html");
    try {
        await fsp.access(file);
        await readAndServe(file, res);
    } catch {
        await readAndServe(path.join(__dirname, "placeholder.html"), res);
    }
});

//*** API ROUTES
// Backend B: tags and recipes
app.use('/api', require('./recipe'));

// Backend A: pantry lookups, ingredients, inventory, and shopping.
app.use('/api', require('./routes/lookups'));
app.use('/api/ingredients', require('./routes/ingredients'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/shopping-list', require('./routes/shopping'));

// Standardized API error response format: { "error": "message" }.
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Anything else (pages)
app.use((req, res) => res.status(404).send("<html><body><h1>404 Not Found</h1><a href=/>Home</a></body></html>"));

app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON body' });
    }
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'A value already exists' });
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(400).json({ error: 'Referenced record does not exist' });
    }
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
        return res.status(409).json({ error: 'Cannot delete a referenced record' });
    }
    if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || err.code === 'ER_DATA_TOO_LONG') {
        return res.status(400).json({ error: 'Value violates database constraints' });
    }

    console.error('API error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

// Close the database pool cleanly on Ctrl+C
process.on('SIGINT', async () => {
    await pool.end();
    process.exit(0);
});
