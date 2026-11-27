const sql = require("mysql2/promise")

const config = {
    host: "localhost",
    user: "root",
    password: "p@sswd", 
    database: "kitchen",
    waitForConnections: true, 
    connectionLimit: 10,
    queueLimit: 0
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
