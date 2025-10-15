# ═══════════════════════════════════════════════════════════════════
# LOCATION TRACKER - ENVIRONMENT CONFIGURATION
# Copy this file to .env and update with your actual values
# ═══════════════════════════════════════════════════════════════════

# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=location_tracker
DB_USER=postgres
DB_PASSWORD=your_password_here

# Security
# Generate a secure API key: openssl rand -hex 32
API_KEY=your_secret_api_key_here

# Optional: For production deployment
# DATABASE_URL=postgresql://user:password@host:port/database