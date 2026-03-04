import express from 'express';
import { json } from 'body-parser';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(json());

// Main application logic
app.get('/', (req, res) => {
    res.send('Hello, TypeScript App!');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});