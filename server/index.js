/* Atlas — yerel sunucu.
   Çalıştırma: npm start  →  http://localhost:3000  (site)  ·  /admin/  (panel) */
'use strict';

const http = require('node:http');
const { handle } = require('./app');
const { ready } = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const server = http.createServer(handle);

// yavaş/yarım istekler bağlantıyı uzun süre tutamasın
server.requestTimeout = 30e3;
server.headersTimeout = 20e3;
server.keepAliveTimeout = 5e3;
server.maxHeadersCount = 60;

ready().then(() => {
  server.listen(PORT, () => {
    console.log('Atlas çalışıyor →  site: http://localhost:' + PORT + '/   panel: http://localhost:' + PORT + '/admin/');
  });
}, (e) => { console.error('Veritabanı açılamadı:', e.message); process.exit(1); });
