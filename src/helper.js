//*** routes/helpers.js — shared functions for building HTML responses
//***
//*** Use in any route file:
//***   const { escapeHtml, makeTable, makePage, errorPage, isId } = require('./helpers');

// SECURITY: escape text before putting it in HTML
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c =>       // regex operation to find certain characters
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));      // replace each with html entity code
    // The characters will still be displayed but reads them as text not html
    // Helps avoid things like entering <script> into the html web address
}

// Build a table from query results: column headings from fields, one row per result
//   const [result, fields] = await pool.execute(sql, params);
//   makeTable("Heading", result, fields)
function makeTable(heading, result, fields) {
    let html = `<H3>${escapeHtml(heading)}</H3>`;
    html += "<TABLE BORDER=1 WIDTH=800>";

    //*** print column headings
    html += "<TR>";
    for (let i = 0; i < fields.length; i++) {
        html += `<TH style="color:Tomato">${escapeHtml(fields[i].name.toUpperCase())}</TH>`;
    }
    html += "</TR>";

    //*** print rows of table data
    for (let i = 0; i < result.length; i++) {
        html += "<TR>";
        for (let j = 0; j < fields.length; j++) {
            html += `<TD style="vertical-align:top">${escapeHtml(result[i][fields[j].name])}</TD>`;
        }
        html += "</TR>";
    }
    if (result.length === 0) {
        html += `<TR><TD colspan=${fields.length}>No results</TD></TR>`;
    }

    html += "</TABLE>";
    return html;
}

// Wrap tables in a full page with a link back to the main menu
function makePage(body) {
    return "<HTML><HEAD><link rel=\"stylesheet\" href=\"/css/styles.css\"></HEAD>"
         + "<BODY class=\"site-page\">"
         + "<div class=\"home-bar\"><a href=\"/\" class=\"home-button\">Home</a></div>"
         + "<main class=\"page-content\">" + body + "</main>"
         + "</BODY></HTML>";
}

// Send an error page with a status code (400, 404, 500...)
function errorPage(res, status, message) {
    res.status(status).send(makePage(`<H1>Error</H1><P>${escapeHtml(message)}</P>`));
}

// true if the value is a whole number greater than 0 (ids, servings)
function isId(value) {
    return Number.isInteger(Number(value)) && Number(value) > 0;
}

module.exports = { escapeHtml, makeTable, makePage, errorPage, isId };
