# 🚀 Location Tracker

## 📋 Table of Contents
1. [Quick Start (5 Minutes)](#quick-start)
2. [Detailed Setup](#detailed-setup)
3. [Database Configuration](#database-configuration)
4. [Testing](#testing)
5. [Deployment](#deployment)
6. [Troubleshooting](#troubleshooting)

---

## ⚡ Quick Start (5 Minutes)

### Prerequisites
- Node.js 14+ installed
- PostgreSQL installed and running
- A terminal/command prompt

### Step 1: Create Project Directory
```bash
mkdir location-tracker && cd location-tracker
```

### Step 2: Create File Structure
```bash
mkdir public
```

### Step 3: Save Files
Save all the provided files in the correct locations:
- `index.html` → `public/index.html`
- `styles.css` → `public/styles.css`
- `app.js` → `public/app.js`
- `server.js` → `./server.js` (root directory)
- `package.json` → `./package.json` (root directory)
- `.env.example` → `./.env.example` (root directory)

### Step 4: Install Dependencies
```bash
npm install
```

### Step 5: Setup PostgreSQL Database
```bash
# Connect to PostgreSQL
sudo -u postgres psql

# Create database
CREATE DATABASE location_tracker;

# Create PostGIS extension (optional, for advanced spatial queries)
\c location_tracker
CREATE EXTENSION IF NOT EXISTS postgis;

# Exit
\q
```

### Step 6: Configure Environment
```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your database password
nano .env
```

Update `DB_PASSWORD` in `.env`:
```
DB_PASSWORD=your_actual_postgres_password
```

### Step 7: Start the Server
```bash
npm start
```

### Step 8: Open in Browser
Open your browser and navigate to:
```
http://localhost:3000
```

**That's it!** 🎉 You should see the app running.

---

## 📖 Detailed Setup

### System Requirements

**Minimum:**
- Node.js 14.0+
- PostgreSQL 12+
- 512MB RAM
- 1GB disk space

**Recommended:**
- Node.js 18+ (LTS)
- PostgreSQL 14+
- 2GB RAM
- 5GB disk space

### Installing PostgreSQL

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib postgis
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### macOS (Homebrew)
```bash
brew install postgresql postgis
brew services start postgresql
```

#### Windows
Download and install from: https://www.postgresql.org/download/windows/

### Installing Node.js

#### Ubuntu/Debian
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### macOS (Homebrew)
```bash
brew install node
```

#### Windows
Download from: https://nodejs.org/

---

## 🗄️ Database Configuration

### Option 1: Automatic Setup (Recommended)
The server automatically creates tables on first run. Just start the server:
```bash
npm start
```

### Option 2: Manual Setup
If you prefer manual control:

```sql
-- Connect to database
psql -U postgres -d location_tracker

-- Create locations table
CREATE TABLE locations (
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

-- Create indexes for performance
CREATE INDEX idx_locations_coords ON locations (latitude, longitude);
CREATE INDEX idx_locations_timestamp ON locations (timestamp DESC);
CREATE INDEX idx_locations_type ON locations (type);

-- Optional: Add PostGIS spatial index
CREATE INDEX idx_locations_geom ON locations USING GIST(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));
```

### Database Connection Options

#### Local PostgreSQL
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=location_tracker
```

#### Remote PostgreSQL (e.g., DigitalOcean, AWS RDS)
```env
DB_HOST=your-db-host.com
DB_PORT=5432
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=location_tracker
```

#### Using DATABASE_URL (Heroku, Render, etc.)
```env
DATABASE_URL=postgresql://user:password@host:port/database
```

---

## 🧪 Testing

### 1. Test Database Connection
```bash
# From project root
node -e "require('dotenv').config(); const {Pool} = require('pg'); const pool = new Pool({host: process.env.DB_HOST, port: process.env.DB_PORT, database: process.
