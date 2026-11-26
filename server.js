// Local development only. On Vercel, api/index.js runs as a serverless function.
try {
  process.loadEnvFile('.env'); // MONGODB_URI, JWT_SECRET, ADMIN_*
} catch {
  console.warn('No .env file found. Copy .env.example to .env and fill it in.');
}
const app = require('./api/index');
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Om-Magnet API on http://localhost:${port}`));
