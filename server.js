// ═══════════════════════════════════════════════════════════════════
// LOCATION TRACKER - BACKEND SERVER
// FILE: server.js
// DESCRIPTION: Node.js + Express + PostgreSQL backend API
// ═══════════════════════════════════════════════════════════════════

require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════════════════════════════
// MIDDLEWARE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// API Key authentication middleware
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    // In development, allow requests without API key
    if (process.env.NODE_ENV === 'development' || !process.env.API_KEY) {
        return next();
    }
    
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    next();
};

// ═══════════════════════════════════════════════════════════════════
// DATABASE CONNECTION
// ═══════════════════════════════════════════════════════════════════

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'location_tracker',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Database connection error:', err.stack);
        console.log('⚠️  Server will run in offline mode - data will not persist');
    } else {
        console.log('✅ Database connected successfully');
        release();
    }
});

// ═══════════════════════════════════════════════════════════════════
// DATABASE INITIALIZATION
// Create tables if they don't exist
// ═══════════════════════════════════════════════════════════════════

const initDatabase = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS locations (
                id BIGINT PRIMARY KEY,
                type VARCHAR(20) NOT NULL CHECK (type IN ('plant', 'litter')),
                note TEXT NOT NULL,
                latitude DOUBLE PRECISION NOT NULL,
                longitude DOUBLE PRECISION NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL,
                address TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        
        // Create spatial index for efficient proximity queries
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_locations_coords 
            ON locations (latitude, longitude);
        `);
        
        // Create index on timestamp for sorting
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_locations_timestamp 
            ON locations (timestamp DESC);
        `);
        
        // Create index on type for filtering
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_locations_type 
            ON locations (type);
        `);
        
        console.log('✅ Database tables initialized');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
    }
};

initDatabase();

// ═══════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

// Health check endpoint
app.get('/api/health', (req, res) => {
    pool.query('SELECT NOW()', (err) => {
        if (err) {
            return res.status(503).json({ 
                status: 'error', 
                database: 'disconnected',
                version: '1.0.0'
            });
        }
        res.json({ 
            status: 'ok', 
            database: 'connected',
            version: '1.0.0',
            timestamp: new Date().toISOString()
        });
    });
});

// Get all locations
app.get('/api/locations', authenticate, async (req, res) => {
    try {
        const { type, limit = 1000, offset = 0 } = req.query;
        
        let query = 'SELECT * FROM locations';
        let params = [];
        
        if (type && (type === 'plant' || type === 'litter')) {
            query += ' WHERE type = $1';
            params.push(type);
        }
        
        query += ' ORDER BY timestamp DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
        params.push(parseInt(limit), parseInt(offset));
        
        const result = await pool.query(query, params);
        
        res.json({
            success: true,
            count: result.rows.length,
            locations: result.rows.map(row => ({
                id: row.id,
                type: row.type,
                note: row.note,
                lat: row.latitude,
                lng: row.longitude,
                timestamp: row.timestamp,
                address: row.address,
                synced: true
            }))
        });
    } catch (error) {
        console.error('Error fetching locations:', error);
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
});

// Get single location by ID
app.get('/api/locations/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'SELECT * FROM locations WHERE id = $1',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }
        
        const row = result.rows[0];
        res.json({
            success: true,
            location: {
                id: row.id,
                type: row.type,
                note: row.note,
                lat: row.latitude,
                lng: row.longitude,
                timestamp: row.timestamp,
                address: row.address,
                synced: true
            }
        });
    } catch (error) {
        console.error('Error fetching location:', error);
        res.status(500).json({ error: 'Failed to fetch location' });
    }
});

// Create new location
app.post('/api/locations', authenticate, async (req, res) => {
    try {
        const { id, type, note, latitude, longitude, timestamp, address } = req.body;
        
        // Validation
        if (!id || !type || !note || !latitude || !longitude || !timestamp) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        if (type !== 'plant' && type !== 'litter') {
            return res.status(400).json({ error: 'Invalid type. Must be "plant" or "litter"' });
        }
        
        if (typeof latitude !== 'number' || typeof longitude !== 'number') {
            return res.status(400).json({ error: 'Latitude and longitude must be numbers' });
        }
        
        // Insert or update (upsert)
        const result = await pool.query(
            `INSERT INTO locations (id, type, note, latitude, longitude, timestamp, address)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO UPDATE SET
                type = EXCLUDED.type,
                note = EXCLUDED.note,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                timestamp = EXCLUDED.timestamp,
                address = EXCLUDED.address,
                updated_at = NOW()
             RETURNING *`,
            [id, type, note, latitude, longitude, timestamp, address || null]
        );
        
        const row = result.rows[0];
        
        res.status(201).json({
            success: true,
            message: 'Location saved successfully',
            location: {
                id: row.id,
                type: row.type,
                note: row.note,
                lat: row.latitude,
                lng: row.longitude,
                timestamp: row.timestamp,
                address: row.address,
                synced: true
            }
        });
        
        console.log(`✅ Location saved: ${type} at ${latitude}, ${longitude}`);
    } catch (error) {
        console.error('Error creating location:', error);
        res.status(500).json({ error: 'Failed to create location' });
    }
});

// Update location
app.put('/api/locations/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { note, address } = req.body;
        
        // Check if location exists
        const checkResult = await pool.query('SELECT id FROM locations WHERE id = $1', [id]);
        
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }
        
        // Build update query dynamically
        const updates = [];
        const params = [];
        let paramCount = 1;
        
        if (note !== undefined) {
            updates.push(`note = $${paramCount++}`);
            params.push(note);
        }
        
        if (address !== undefined) {
            updates.push(`address = $${paramCount++}`);
            params.push(address);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        
        updates.push(`updated_at = NOW()`);
        params.push(id);
        
        const query = `UPDATE locations SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
        const result = await pool.query(query, params);
        
        const row = result.rows[0];
        
        res.json({
            success: true,
            message: 'Location updated successfully',
            location: {
                id: row.id,
                type: row.type,
                note: row.note,
                lat: row.latitude,
                lng: row.longitude,
                timestamp: row.timestamp,
                address: row.address,
                synced: true
            }
        });
        
        console.log(`✅ Location updated: ID ${id}`);
    } catch (error) {
        console.error('Error updating location:', error);
        res.status(500).json({ error: 'Failed to update location' });
    }
});

// Delete location
app.delete('/api/locations/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'DELETE FROM locations WHERE id = $1 RETURNING id',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }
        
        res.json({
            success: true,
            message: 'Location deleted successfully',
            id: result.rows[0].id
        });
        
        console.log(`🗑️  Location deleted: ID ${id}`);
    } catch (error) {
        console.error('Error deleting location:', error);
        res.status(500).json({ error: 'Failed to delete location' });
    }
});

// Delete all locations (use with caution!)
app.delete('/api/locations', authenticate, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM locations RETURNING id');
        
        res.json({
            success: true,
            message: 'All locations deleted',
            count: result.rows.length
        });
        
        console.log(`🗑️  All locations deleted: ${result.rows.length} records`);
    } catch (error) {
        console.error('Error deleting all locations:', error);
        res.status(500).json({ error: 'Failed to delete locations' });
    }
});

// Get statistics
app.get('/api/stats', authenticate, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN type = 'plant' THEN 1 END) as plants,
                COUNT(CASE WHEN type = 'litter' THEN 1 END) as litter,
                MIN(timestamp) as earliest,
                MAX(timestamp) as latest
            FROM locations
        `);
        
        res.json({
            success: true,
            stats: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Find nearby locations (within radius)
app.get('/api/locations/nearby/:lat/:lng', authenticate, async (req, res) => {
    try {
        const { lat, lng } = req.params;
        const { radius = 1000, type } = req.query; // radius in meters
        
        // Simple distance calculation (approximate, good for small areas)
        // For production, consider using PostGIS extension
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);
        const radiusInDegrees = parseFloat(radius) / 111320; // meters to degrees
        
        let query = `
            SELECT *, 
                   (6371000 * acos(cos(radians($1)) * cos(radians(latitude)) * 
                   cos(radians(longitude) - radians($2)) + sin(radians($1)) * 
                   sin(radians(latitude)))) AS distance
            FROM locations
            WHERE latitude BETWEEN $1 - $3 AND $1 + $3
              AND longitude BETWEEN $2 - $3 AND $2 + $3
        `;
        
        const params = [latitude, longitude, radiusInDegrees];
        
        if (type && (type === 'plant' || type === 'litter')) {
            query += ' AND type = $4';
            params.push(type);
        }
        
        query += ' ORDER BY distance LIMIT 50';
        
        const result = await pool.query(query, params);
        
        res.json({
            success: true,
            count: result.rows.length,
            center: { lat: latitude, lng: longitude },
            radius: parseFloat(radius),
            locations: result.rows.map(row => ({
                id: row.id,
                type: row.type,
                note: row.note,
                lat: row.latitude,
                lng: row.longitude,
                timestamp: row.timestamp,
                address: row.address,
                distance: Math.round(row.distance),
                synced: true
            }))
        });
    } catch (error) {
        console.error('Error finding nearby locations:', error);
        res.status(500).json({ error: 'Failed to find nearby locations' });
    }
});

// Export all data as JSON
app.get('/api/export', authenticate, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM locations ORDER BY timestamp DESC');
        
        const data = result.rows.map(row => ({
            id: row.id,
            type: row.type,
            note: row.note,
            lat: row.latitude,
            lng: row.longitude,
            timestamp: row.timestamp,
            address: row.address
        }));
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="locations-export-${Date.now()}.json"`);
        res.json(data);
        
        console.log(`📥 Data exported: ${data.length} locations`);
    } catch (error) {
        console.error('Error exporting data:', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
});

// Bulk import locations
app.post('/api/import', authenticate, async (req, res) => {
    try {
        const { locations } = req.body;
        
        if (!Array.isArray(locations)) {
            return res.status(400).json({ error: 'Locations must be an array' });
        }
        
        let imported = 0;
        let failed = 0;
        
        for (const loc of locations) {
            try {
                await pool.query(
                    `INSERT INTO locations (id, type, note, latitude, longitude, timestamp, address)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (id) DO NOTHING`,
                    [loc.id, loc.type, loc.note, loc.lat, loc.lng, loc.timestamp, loc.address]
                );
                imported++;
            } catch (err) {
                failed++;
                console.error(`Failed to import location ${loc.id}:`, err.message);
            }
        }
        
        res.json({
            success: true,
            message: 'Import completed',
            imported,
            failed,
            total: locations.length
        });
        
        console.log(`📤 Data imported: ${imported} successful, ${failed} failed`);
    } catch (error) {
        console.error('Error importing data:', error);
        res.status(500).json({ error: 'Failed to import data' });
    }
});

// ═══════════════════════════════════════════════════════════════════
// SERVE FRONTEND
// ═══════════════════════════════════════════════════════════════════

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ═══════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🚀 LOCATION TRACKER SERVER');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📡 Server running on: http://localhost:${PORT}`);
    console.log(`🗄️  Database: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}`);
    console.log(`🔑 API Key: ${process.env.API_KEY ? 'Enabled' : 'Disabled (dev mode)'}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('═══════════════════════════════════════════════════════\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    pool.end(() => {
        console.log('Database pool closed');
        process.exit(0);
    });
});
