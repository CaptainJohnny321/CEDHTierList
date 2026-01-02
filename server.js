import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = 3001;
const API_KEY = process.env['API_KEY'];

console.log('Working directory:', __dirname);
console.log('API_KEY loaded:', API_KEY ? 'Yes - ' + API_KEY : 'No');

app.use(cors());
app.use(express.json());

// Cache for tournament data
let tournamentCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Updated endpoint for tournaments
app.get('/api/tournaments', async (req, res) => {
    try {
        // Check cache first
        const now = Date.now();
        if (tournamentCache && (now - cacheTimestamp) < CACHE_DURATION) {
            console.log('Returning cached tournament data');
            return res.json(tournamentCache);
        }

        console.log('Fetching fresh tournament data from API...');
        // Use the correct TopDeck.gg endpoint with POST
        const response = await fetch('https://topdeck.gg/api/v2/tournaments', {
            method: 'POST',
            headers: {
                'Authorization': API_KEY ?? '',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                last: 14,
                game: 'Magic: The Gathering',
                format: 'EDH',
                columns: ['name', 'wins', 'losses', 'participants'],
                players: ['name', 'wins', 'losses', 'deckObj'],
                rounds: false,
                participantMin: 8
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Response:', response.status, errorText);
            throw new Error(`TopDeck API error: ${response.status} - ${errorText}`);
        }

        let data = await response.json();
        console.log('Received tournaments from API:', data.length);
        
        // Add participant count based on standings length and extract commanders
        if (Array.isArray(data)) {
            data = data.map(tournament => {
                const participantCount = (tournament.standings && Array.isArray(tournament.standings)) 
                    ? tournament.standings.length 
                    : 0;
                
                // Extract commanders from each standing's deckObj
                if (tournament.standings && Array.isArray(tournament.standings)) {
                    tournament.standings = tournament.standings.map((standing, idx) => {
                        let commanders = [];
                        if (standing.deckObj) {
                            console.log(`Standing ${idx} deckObj keys:`, Object.keys(standing.deckObj));
                            console.log(`Standing ${idx} deckObj:`, JSON.stringify(standing.deckObj).substring(0, 200));
                            
                            // Try different possible keys for commanders
                            if (standing.deckObj.Commanders) {
                                commanders = Object.keys(standing.deckObj.Commanders).slice(0, 2);
                            } else if (standing.deckObj.commanders) {
                                commanders = Object.keys(standing.deckObj.commanders).slice(0, 2);
                            } else if (standing.deckObj.Commander) {
                                commanders = [standing.deckObj.Commander];
                            } else if (standing.deckObj.name) {
                                commanders = [standing.deckObj.name];
                            }
                        }
                        return {
                            ...standing,
                            commanders: commanders
                        };
                    });
                }
                
                return {
                    ...tournament,
                    data: {
                        ...tournament.data,
                        participants: participantCount
                    }
                };
            });
        }
        
        if (data.length > 0 && data[0].standings && data[0].standings[0]) {
            console.log('First standing (before filter):', JSON.stringify(data[0].standings[0], null, 2).substring(0, 500));
        }

        // Filter for tournaments with CEDH in the name and exclude future events
        const nowInSeconds = Math.floor(Date.now() / 1000); // Current time in seconds
        if (Array.isArray(data)) {
            data = data.filter(tournament => {
                const tournamentName = (tournament.data?.name || tournament.tournamentName || '').toLowerCase();
                const startDate = tournament.data?.startDate || tournament.startDate || 0;
                // Only include tournaments that have already started
                return tournamentName.includes('cedh') && startDate <= nowInSeconds;
            });
            
            // Sort by date descending (most recent first)
            data.sort((a, b) => {
                const dateA = a.data?.startDate || a.startDate || 0;
                const dateB = b.data?.startDate || b.startDate || 0;
                return dateB - dateA;
            });
        }
        
        console.log('After filtering by CEDH name:', data.length, 'tournaments');

        // Cache the result
        tournamentCache = data;
        cacheTimestamp = now;

        // Send the filtered data
        res.json(data);
    } catch (error) {
        console.error('Error in /api/tournaments:', error);
        const errorMessage = typeof error === 'object' && error !== null && 'message' in error ? (error).message : String(error);
        res.status(500).json({ error: errorMessage });
    }
});

app.listen(PORT, () => {
    console.log(`Proxy server running on http://localhost:${PORT}`);
});