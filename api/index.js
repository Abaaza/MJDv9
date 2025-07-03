// Vercel serverless function that proxies to the Express backend
const app = require('../backend/dist/index.js');

module.exports = app;