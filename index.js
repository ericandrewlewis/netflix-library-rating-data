// Set process.env based on values in .env file
require('dotenv').config();
if (!process.env.OMDB_API_KEY) {
  console.error('Set the API key in .env');
  process.exit();
}
require('./movies')
require('./tv-shows')
