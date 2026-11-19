const express = require('express');
const app = express();
const PORT = 3000; 
const fsp = require("fs").promises; // Use fs/promises for async/await file operations

// Requires the exported pool object from the local 'mysql.js' file
const pool = require('./mysql'); 

//*** create form parser
// Using express's built-in body parser for simplicity and consistency
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

async function readAndServe(path, res) {
    try {
        const data = await fsp.readFile(path);
        res.setHeader('Content-Type', 'text/html');
        res.end(data);
    } catch (err) {
        console.error("File Read Error:", err);
        res.status(404).send("<html><body><h1>404 Not Found</h1><p>The file " + path + " could not be served.</p></body></html>");
    }
}

app.get("/api/tags", async (req, res) => {
    await readAndServe("./main.html", res);
});
