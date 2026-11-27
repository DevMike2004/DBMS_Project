//*** server.js — main entry point. Run with:  node server.js   (from the src folder or anywhere)
//***
//***   /                 -> homepage.html
//***   /<page>.html      -> that page from src/ (placeholder.html if it isn't built yet)
//***   /css/...          -> stylesheets
//***   /api/...          -> API routes (recipe.js; add pantry/shopping routes the same way)

const express = require('express');
const path = require('path');
const fsp = require("fs").promises; // Use fs/promises for async/await file operations

const app = express();
const PORT = process.env.PORT || 3000;

// Requires the exported pool object from the local 'mysql.js' file
// (requiring it here also runs the connection check at startup)
const pool = require('./mysql');
const { errorPage } = require('./helper');

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
app.use('/api', require('./recipe'));        // Backend B: tags and recipes
// app.use('/api', require('./pantry'));     // Backend A: add here when ready

// Unknown API route
app.use('/api', (req, res) => errorPage(res, 404, "No such API route: " + req.method + " " + req.originalUrl));

// Anything else
app.use((req, res) => res.status(404).send("<html><body><h1>404 Not Found</h1><a href=/>Main Menu</a></body></html>"));

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

// Close the database pool cleanly on Ctrl+C
process.on('SIGINT', async () => {
    await pool.end();
    process.exit(0);
});
