// ═══════════════════════════════════════════════════════════════════
// PLANT & LITTER LOCATION TRACKER - FRONTEND APPLICATION
// FILE: app.js (save to public/app.js)
// DESCRIPTION: Complete application logic with database integration
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// APPLICATION STATE & CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const app = {
    // Core data storage
    locations: [],
    currentType: null,
    currentPosition: null,
    currentFilter: 'all',
    
    // Map objects
    map: null,
    userMarker: null,
    markers: {},
    
    // Database configuration
    config: {
        serverUrl: window.location.origin,
        apiKey: '',
        syncInterval: 30000, // 30 seconds
        offlineMode: false
    },
    
    // Sync state
    syncState: {
        isSyncing: false,
        lastSync: null,
        pendingSync: []
    }
};

// ═══════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    app.log('🚀 System starting...', 'info');
    app.initMap();
    app.loadConfig();
    app.loadStoredLocations();
    app.startLocationTracking();
    app.startAutoSync();
    app.checkConnection();
    app.log('✅ System initialized successfully', 'success');
});

// ═══════════════════════════════════════════════════════════════════
// MAP INITIALIZATION & MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

app.initMap = function() {
    // Initialize Leaflet map centered on Centreville, VA
    this.map = L.map('map').setView([38.8408, -77.1831], 13);
    
    // Add OpenStreetMap tile layer (no API key required)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(this.map);
    
    this.log('🗺️ Map initialized', 'success');
};

app.startLocationTracking = function() {
    if (!navigator.geolocation) {
        this.log('❌ Geolocation not supported', 'error');
        this.showToast('Geolocation not supported', 'error');
        return;
    }
    
    // Get initial position
    navigator.geolocation.getCurrentPosition(
        (position) => {
            this.currentPosition = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            this.map.setView([this.currentPosition.lat, this.currentPosition.lng], 15);
            this.updateUserMarker();
            this.log(`📍 Location acquired: ${this.currentPosition.lat.toFixed(6)}, ${this.currentPosition.lng.toFixed(6)}`, 'success');
        },
        (error) => {
            this.log('⚠️ Location access denied: ' + error.message, 'error');
            this.showToast('Please enable location access', 'error');
        }
    );
    
    // Watch position for continuous updates
    navigator.geolocation.watchPosition(
        (position) => {
            this.currentPosition = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            this.updateUserMarker();
        },
        (error) => {
            console.error('Location tracking error:', error);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 10000,
            timeout: 5000
        }
    );
};

app.updateUserMarker = function() {
    if (!this.currentPosition) return;
    
    if (this.userMarker) {
        this.userMarker.setLatLng([this.currentPosition.lat, this.currentPosition.lng]);
    } else {
        // Create pulsing blue dot for user location
        const blueIcon = L.divIcon({
            html: '<div class="user-location-marker"></div>',
            className: 'user-marker-wrapper',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
        
        this.userMarker = L.marker([this.currentPosition.lat, this.currentPosition.lng], {
            icon: blueIcon,
            zIndexOffset: 1000
        }).addTo(this.map);
    }
};

app.centerOnLocation = function() {
    if (this.currentPosition) {
        this.map.setView([this.currentPosition.lat, this.currentPosition.lng], 16);
    } else {
        this.showToast('Getting your location...', 'info');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                this.currentPosition = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                this.map.setView([this.currentPosition.lat, this.currentPosition.lng], 16);
                this.updateUserMarker();
            },
            (error) => {
                this.showToast('Unable to get your location', 'error');
                this.log('❌ Location error: ' + error.message, 'error');
            }
        );
    }
};

// ═══════════════════════════════════════════════════════════════════
// LOCATION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

app.openNoteModal = function(type) {
    if (!this.currentPosition) {
        this.showToast('Unable to get your location. Please enable location services.', 'error');
        return;
    }
    
    this.currentType = type;
    document.getElementById('modalTitle').textContent = 
        type === 'plant' ? '🌿 Invasive Plant Note' : '🗑️ Litter Note';
    document.getElementById('noteInput').value = '';
    document.getElementById('noteModal').classList.add('open');
};

app.closeNoteModal = function() {
    document.getElementById('noteModal').classList.remove('open');
    this.currentType = null;
};

app.saveLocation = function() {
    const note = document.getElementById('noteInput').value.trim();
    
    if (!note) {
        this.showToast('Please enter a note', 'error');
        return;
    }
    
    if (!this.currentPosition) {
        this.showToast('Location not available', 'error');
        return;
    }
    
    // Create location object
    const location = {
        id: Date.now(),
        type: this.currentType,
        note: note,
        lat: this.currentPosition.lat,
        lng: this.currentPosition.lng,
        timestamp: new Date().toISOString(),
        address: 'Loading...',
        synced: false
    };
    
    this.locations.push(location);
    this.saveToLocalStorage();
    
    // Reverse geocode to get address
    this.reverseGeocode(location);
    
    // Add marker to map
    this.addMarker(location);
    
    // Update UI
    this.updateStats();
    this.updateLocationList();
    this.closeNoteModal();
    
    // Sync to database
    this.syncLocationToServer(location);
    
    this.showToast('📍 Location saved!', 'success');
    this.log(`✅ Location added: ${location.type} at ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`, 'success');
};

app.reverseGeocode = function(location) {
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${location.lat}&lon=${location.lng}&format=json`)
        .then(response => response.json())
        .then(data => {
            location.address = data.display_name || 'Address unavailable';
            this.saveToLocalStorage();
            this.updateLocationList();
        })
        .catch(() => {
            location.address = 'Address unavailable';
            this.log('⚠️ Geocoding failed for location ' + location.id, 'warning');
        });
};

app.addMarker = function(location) {
    const color = location.type === 'plant' ? '#10b981' : '#f59e0b';
    const icon = location.type === 'plant' ? '🌿' : '🗑️';
    
    // Create custom marker icon
    const customIcon = L.divIcon({
        html: `<div style="background: ${color}; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: 3px solid white;">${icon}</div>`,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });
    
    // Create marker with popup
    const marker = L.marker([location.lat, location.lng], { icon: customIcon })
        .addTo(this.map)
        .bindPopup(`
            <div style="padding: 8px; min-width: 200px;">
                <strong style="font-size: 16px;">${icon} ${location.type === 'plant' ? 'Invasive Plant' : 'Litter'}</strong><br>
                <small style="color: #666;">${new Date(location.timestamp).toLocaleString()}</small><br>
                <p style="margin: 10px 0; font-size: 14px;">${location.note}</p>
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
                    ${location.synced ? '<span style="color: #10b981; font-size: 12px;">✓ Synced to server</span>' : '<span style="color: #f59e0b; font-size: 12px;">⟳ Pending sync</span>'}
                </div>
            </div>
        `);
    
    // Store marker reference
    this.markers[location.id] = marker;
};

app.deleteLocation = function(id) {
    if (!confirm('Delete this location?')) return;
    
    const location = this.locations.find(l => l.id === id);
    
    // Remove from map
    if (this.markers[id]) {
        this.map.removeLayer(this.markers[id]);
        delete this.markers[id];
    }
    
    // Remove from array
    this.locations = this.locations.filter(l => l.id !== id);
    this.saveToLocalStorage();
    
    // Update UI
    this.updateStats();
    this.updateLocationList();
    
    // Delete from server if synced
    if (location && location.synced) {
        this.deleteFromServer(id);
    }
    
    this.showToast('🗑️ Location deleted', 'success');
    this.log(`🗑️ Location deleted: ID ${id}`, 'info');
};

app.viewLocation = function(id) {
    const location = this.locations.find(l => l.id === id);
    if (location) {
        this.map.setView([location.lat, location.lng], 18);
        if (this.markers[id]) {
            this.markers[id].openPopup();
        }
        // Close sidebar on mobile
        const sidebar = document.getElementById('sidebar');
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('open');
        }
    }
};

// ═══════════════════════════════════════════════════════════════════
// DATABASE SYNCHRONIZATION
// ═══════════════════════════════════════════════════════════════════

app.syncLocationToServer = async function(location) {
    if (this.config.offlineMode) {
        this.syncState.pendingSync.push(location.id);
        this.log('⚠️ Offline mode: Location queued for sync', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`${this.config.serverUrl}/api/locations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.config.apiKey
            },
            body: JSON.stringify({
                id: location.id,
                type: location.type,
                note: location.note,
                latitude: location.lat,
                longitude: location.lng,
                timestamp: location.timestamp,
                address: location.address
            })
        });
        
        if (response.ok) {
            location.synced = true;
            this.saveToLocalStorage();
            this.updateLocationList();
            this.updateSyncIndicator('online');
            this.log(`✅ Location synced to server: ID ${location.id}`, 'success');
        } else {
            throw new Error('Server returned error: ' + response.status);
        }
    } catch (error) {
        this.syncState.pendingSync.push(location.id);
        this.updateSyncIndicator('offline');
        this.log('⚠️ Sync failed: ' + error.message + ' (will retry)', 'warning');
    }
};

app.syncNow = async function() {
    if (this.syncState.isSyncing) {
        this.showToast('Sync already in progress', 'error');
        return;
    }
    
    this.syncState.isSyncing = true;
    this.updateSyncIndicator('syncing');
    this.log('🔄 Starting manual sync...', 'info');
    
    const unsyncedLocations = this.locations.filter(l => !l.synced);
    
    if (unsyncedLocations.length === 0) {
        this.showToast('All locations already synced', 'success');
        this.syncState.isSyncing = false;
        this.updateSyncIndicator('online');
        return;
    }
    
    let successCount = 0;
    let failCount = 0;
    
    for (const location of unsyncedLocations) {
        try {
            const response = await fetch(`${this.config.serverUrl}/api/locations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.config.apiKey
                },
                body: JSON.stringify({
                    id: location.id,
                    type: location.type,
                    note: location.note,
                    latitude: location.lat,
                    longitude: location.lng,
                    timestamp: location.timestamp,
                    address: location.address
                })
            });
            
            if (response.ok) {
                location.synced = true;
                successCount++;
            } else {
                failCount++;
            }
        } catch (error) {
            failCount++;
        }
    }
    
    this.saveToLocalStorage();
    this.updateLocationList();
    this.syncState.isSyncing = false;
    this.syncState.lastSync = new Date();
    
    if (failCount === 0) {
        this.config.offlineMode = false;
        this.updateSyncIndicator('online');
        this.showToast(`✅ Synced ${successCount} locations`, 'success');
        this.log(`✅ Sync complete: ${successCount} synced`, 'success');
    } else {
        this.updateSyncIndicator('offline');
        this.showToast(`⚠️ Synced ${successCount}, failed ${failCount}`, 'error');
        this.log(`⚠️ Sync partial: ${successCount} synced, ${failCount} failed`, 'warning');
    }
};

app.deleteFromServer = async function(id) {
    if (this.config.offlineMode) return;
    
    try {
        await fetch(`${this.config.serverUrl}/api/locations/${id}`, {
            method: 'DELETE',
            headers: {
                'X-API-Key': this.config.apiKey
            }
        });
        this.log(`✅ Location deleted from server: ID ${id}`, 'success');
    } catch (error) {
        this.log('❌ Delete from server failed: ' + error.message, 'error');
    }
};

app.startAutoSync = function() {
    setInterval(() => {
        const unsyncedCount = this.locations.filter(l => !l.synced).length;
        if (unsyncedCount > 0 && !this.syncState.isSyncing && !this.config.offlineMode) {
            this.log(`🔄 Auto-sync triggered: ${unsyncedCount} pending`, 'info');
            this.syncNow();
        }
    }, this.config.syncInterval);
};

app.checkConnection = async function() {
    try {
        const response = await fetch(`${this.config.serverUrl}/api/health`, {
            method: 'GET',
            headers: {
                'X-API-Key': this.config.apiKey
            }
        });
        
        if (response.ok) {
            this.config.offlineMode = false;
            this.updateSyncIndicator('online');
            this.log('✅ Server connection established', 'success');
            return true;
        }
    } catch (error) {
        this.config.offlineMode = true;
        this.updateSyncIndicator('offline');
        this.log('⚠️ Server offline - running in offline mode', 'warning');
    }
    return false;
};

app.testConnection = async function() {
    const serverUrl = document.getElementById('dbServerUrl').value;
    const apiKey = document.getElementById('apiKey').value;
    
    this.config.serverUrl = serverUrl;
    this.config.apiKey = apiKey;
    this.saveConfig();
    
    const statusEl = document.getElementById('connectionStatus');
    statusEl.textContent = '🔄 Testing connection...';
    statusEl.className = 'status-message';
    statusEl.style.display = 'block';
    
    try {
        const response = await fetch(`${serverUrl}/api/health`, {
            method: 'GET',
            headers: {
                'X-API-Key': apiKey
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            statusEl.textContent = `✅ Connected to server (v${data.version || '1.0'})`;
            statusEl.className = 'status-message success';
            this.config.offlineMode = false;
            this.updateSyncIndicator('online');
            this.log('✅ Connection test successful', 'success');
        } else {
            throw new Error('Server returned error');
        }
    } catch (error) {
        statusEl.textContent = '❌ Connection failed - running in offline mode';
        statusEl.className = 'status-message error';
        this.config.offlineMode = true;
        this.updateSyncIndicator('offline');
        this.log('❌ Connection test failed: ' + error.message, 'error');
    }
};

// ═══════════════════════════════════════════════════════════════════
// UI UPDATES & HELPERS
// ═══════════════════════════════════════════════════════════════════

app.updateStats = function() {
    const plantCount = this.locations.filter(l => l.type === 'plant').length;
    const litterCount = this.locations.filter(l => l.type === 'litter').length;
    
    document.getElementById('plantCount').textContent = plantCount;
    document.getElementById('litterCount').textContent = litterCount;
    
    // Update dev panel stats
    const totalCountEl = document.getElementById('totalCount');
    const syncedCountEl = document.getElementById('syncedCount');
    const pendingCountEl = document.getElementById('pendingCount');
    
    if (totalCountEl) totalCountEl.textContent = this.locations.length;
    if (syncedCountEl) syncedCountEl.textContent = this.locations.filter(l => l.synced).length;
    if (pendingCountEl) pendingCountEl.textContent = this.locations.filter(l => !l.synced).length;
};

app.updateLocationList = function() {
    const listEl = document.getElementById('locationList');
    
    let filteredLocations = this.locations;
    if (this.currentFilter !== 'all') {
        filteredLocations = this.locations.filter(l => l.type === this.currentFilter);
    }
    
    if (filteredLocations.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <h3>No locations yet</h3>
                <p>Start tracking by tapping a button below</p>
            </div>
        `;
        return;
    }
    
    const sortedLocations = [...filteredLocations].sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    listEl.innerHTML = sortedLocations.map(location => `
        <div class="location-item ${location.type} ${location.synced ? 'synced' : 'pending'}">
            <h3>
                ${location.type === 'plant' ? '🌿' : '🗑️'}
                ${location.type === 'plant' ? 'Invasive Plant' : 'Litter'}
            </h3>
            <p><strong>Note:</strong> ${location.note}</p>
            <p><strong>When:</strong> ${new Date(location.timestamp).toLocaleString()}</p>
            <p><strong>Where:</strong> ${location.address}</p>
            <div class="actions">
                <button class="view-btn" onclick="app.viewLocation(${location.id})">📍 View on Map</button>
                <button class="delete-btn" onclick="app.deleteLocation(${location.id})">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
};

app.filterLocations = function(type) {
    this.currentFilter = type;
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === type) {
            btn.classList.add('active');
        }
    });
    
    this.updateLocationList();
};

app.updateSyncIndicator = function(status) {
    const indicator = document.getElementById('syncIndicator');
    const text = document.getElementById('syncText');
    
    indicator.className = '';
    
    switch(status) {
        case 'online':
            indicator.classList.add('online');
            text.textContent = 'Online';
            break;
        case 'offline':
            indicator.classList.add('offline');
            text.textContent = 'Offline';
            break;
        case 'syncing':
            indicator.classList.add('syncing');
            text.textContent = 'Syncing';
            break;
    }
};

app.toggleSidebar = function() {
    document.getElementById('sidebar').classList.toggle('open');
};

app.toggleDevPanel = function() {
    const panel = document.getElementById('devPanel');
    panel.classList.toggle('collapsed');
    const btn = panel.querySelector('.collapse-btn');
    btn.textContent = panel.classList.contains('collapsed') ? '+' : '−';
};

app.showToast = function(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
};

app.log = function(message, type = 'info') {
    const logEl = document.getElementById('debugLog');
    if (!logEl) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${timestamp}] ${message}`;
    
    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;
    
    while (logEl.children.length > 100) {
        logEl.removeChild(logEl.firstChild);
    }
};

app.clearLog = function() {
    document.getElementById('debugLog').innerHTML = '<div class="log-entry info">📝 Log cleared</div>';
};

// ═══════════════════════════════════════════════════════════════════
// LOCAL STORAGE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

app.saveToLocalStorage = function() {
    try {
        const data = JSON.stringify(this.locations);
        localStorage.setItem('tracker_locations', data);
        console.log('💾 Saved to localStorage:', this.locations.length, 'locations');
    } catch (e) {
        console.error('Failed to save to localStorage:', e);
    }
};

app.loadStoredLocations = function() {
    try {
        const stored = localStorage.getItem('tracker_locations');
        if (stored) {
            this.locations = JSON.parse(stored);
            this.locations.forEach(location => this.addMarker(location));
            this.updateStats();
            this.updateLocationList();
            this.log(`📂 Loaded ${this.locations.length} locations from storage`, 'success');
        }
    } catch (e) {
        console.error('Failed to load from localStorage:', e);
    }
};

app.saveConfig = function() {
    try {
        localStorage.setItem('tracker_config', JSON.stringify(this.config));
    } catch (e) {
        console.error('Failed to save config:', e);
    }
};

app.loadConfig = function() {
    try {
        const stored = localStorage.getItem('tracker_config');
        if (stored) {
            this.config = { ...this.config, ...JSON.parse(stored) };
        }
        
        const urlInput = document.getElementById('dbServerUrl');
        const keyInput = document.getElementById('apiKey');
        if (urlInput) urlInput.value = this.config.serverUrl;
        if (keyInput) keyInput.value = this.config.apiKey;
    } catch (e) {
        console.error('Failed to load config:', e);
    }
};

// ═══════════════════════════════════════════════════════════════════
// EXPORT / IMPORT DATA
// ═══════════════════════════════════════════════════════════════════

app.exportData = function() {
    const dataStr = JSON.stringify(this.locations, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `locations-export-${Date.now()}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    this.showToast('📥 Data exported', 'success');
    this.log('📥 Exported ' + this.locations.length + ' locations', 'success');
};

app.importData = function(file) {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            
            if (!Array.isArray(imported)) {
                throw new Error('Invalid data format');
            }
            
            let addedCount = 0;
            imported.forEach(loc => {
                if (!this.locations.find(l => l.id === loc.id)) {
                    this.locations.push(loc);
                    this.addMarker(loc);
                    addedCount++;
                }
            });
            
            this.saveToLocalStorage();
            this.updateStats();
            this.updateLocationList();
            
            this.showToast(`📤 Imported ${addedCount} new locations`, 'success');
            this.log(`📤 Imported ${addedCount} locations`, 'success');
        } catch (error) {
            this.showToast('❌ Import failed: Invalid file', 'error');
            this.log('❌ Import error: ' + error.message, 'error');
        }
    };
    
    reader.readAsText(file);
};

app.clearAllData = function() {
    if (!confirm('⚠️ Delete ALL locations? This cannot be undone!')) return;
    
    // Clear from map
    Object.values(this.markers).forEach(marker => this.map.removeLayer(marker));
    this.markers = {};
    
    // Clear data
    this.locations = [];
    this.saveToLocalStorage();
    
    // Update UI
    this.updateStats();
    this.updateLocationList();
    
    this.showToast('🗑️ All data cleared', 'success');
    this.log('🗑️ All data cleared', 'warning');
};

// ═══════════════════════════════════════════════════════════════════
// DEVELOPER TOOLS
// ═══════════════════════════════════════════════════════════════════

app.addManualLocation = function(lat, lng, type, note) {
    const location = {
        id: Date.now(),
        type: type || 'plant',
        note: note || 'Manual test entry',
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        timestamp: new Date().toISOString(),
        address: 'Manually added',
        synced: false
    };
    
    this.locations.push(location);
    this.saveToLocalStorage();
    this.addMarker(location);
    this.updateStats();
    this.updateLocationList();
    
    this.showToast('✅ Manual location added', 'success');
    this.log(`✅ Manual location added: ${lat}, ${lng}`, 'info');
};

// Add CSS for user location marker
const style = document.createElement('style');
style.textContent = `
.user-location-marker {
    width: 20px;
    height: 20px;
    background: #4285F4;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0% {
        box-shadow: 0 0 0 0 rgba(66, 133, 244, 0.7);
    }
    70% {
        box-shadow: 0 0 0 10px rgba(66, 133, 244, 0);
    }
    100% {
        box-shadow: 0 0 0 0 rgba(66, 133, 244, 0);
    }
}

.user-marker-wrapper {
    background: transparent !important;
    border: none !important;
}
`;
document.head.appendChild(style);

// ═══════════════════════════════════════════════════════════════════
// EXPOSE API FOR CONSOLE DEBUGGING
// ═══════════════════════════════════════════════════════════════════

if (window.innerWidth > 768) {
    console.log('%c🔧 Developer Tools Available', 'color: #10b981; font-size: 16px; font-weight: bold;');
    console.log('%cUse these commands in the console:', 'color: #666; font-size: 12px;');
    console.log('%c- app.addManualLocation(lat, lng, type, note)', 'color: #4285F4;');
    console.log('%c- app.exportData()', 'color: #4285F4;');
    console.log('%c- app.syncNow()', 'color: #4285F4;');
    console.log('%c- app.clearAllData()', 'color: #4285F4;');
    console.log('%c- app.checkConnection()', 'color: #4285F4;');
}

// Make app globally accessible for debugging
window.app = app;
    
