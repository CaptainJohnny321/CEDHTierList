import http from 'http';

const PORT = 3002;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Hello from test server' }));
});

server.listen(PORT, () => {
    console.log(`Test server running on http://localhost:${PORT}`);
});
