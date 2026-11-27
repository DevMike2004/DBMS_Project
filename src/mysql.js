//require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sql = require("mysql2/promise")

const config = {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "p@sswd",
    database: process.env.DB_NAME || "kitchen",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true // Return MySQL DATE values as YYYY-MM-DD strings
}

const pool = sql.createPool(config);

pool.getConnection()
    .then(connection => {
        console.log("Database Pool: Connection successful");
        connection.release();
    })
    .catch(err => {
        console.error("**ERROR**: couldn't connect to MySql client; check credentials: \nPrinting Stack Trace:\n\n");
        console.error(err);
    });

module.exports = pool;
