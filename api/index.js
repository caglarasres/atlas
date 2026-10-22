/* Vercel sunucusuz işlevi: tüm dinamik istekler (/, /api/*, /uploads/*) buraya yönlendirilir (vercel.json).
   assets/ ve admin/ dosyaları Vercel'in CDN'inden doğrudan sunulur. */
'use strict';

const { handle } = require('../server/app');

module.exports = (req, res) => handle(req, res);
