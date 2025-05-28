// Simple JSON-based player tracker
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLAYERS_FILE = path.join(__dirname, 'players-database.json');

// Initialize players database file if it doesn't exist
function initPlayersFile() {
  if (!fs.existsSync(PLAYERS_FILE)) {
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify({}, null, 2));
    console.log('✅ Created players database file');
  }
}

// Load players from JSON file
function loadPlayers() {
  try {
    if (fs.existsSync(PLAYERS_FILE)) {
      const data = fs.readFileSync(PLAYERS_FILE, 'utf8');
      return JSON.parse(data);
    }
    return {};
  } catch (error) {
    console.warn('❌ Error loading players file:', error.message);
    return {};
  }
}

// Save players to JSON file
function savePlayers(players) {
  try {
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(players, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Error saving players file:', error.message);
    return false;
  }
}

// Save or update a player
function savePlayer(uid, name, playerId) {
  try {
    console.log(`📝 Saving player to JSON database: ${name} (${uid})`);
    
    const players = loadPlayers();
    const now = new Date().toISOString();
    
    if (players[uid]) {
      // Update existing player
      players[uid].name = name;
      players[uid].playerId = playerId;
      players[uid].lastSeen = now;
      players[uid].timesSeen = (players[uid].timesSeen || 1) + 1;
      console.log(`✅ Updated existing player: ${name} (seen ${players[uid].timesSeen} times)`);
    } else {
      // Add new player
      players[uid] = {
        uid: uid,
        name: name,
        playerId: playerId,
        firstSeen: now,
        lastSeen: now,
        timesSeen: 1
      };
      console.log(`✅ Added new player: ${name}`);
    }
    
    const success = savePlayers(players);
    if (success) {
      console.log(`💾 Player database updated successfully`);
    }
    return success;
  } catch (error) {
    console.error('❌ Error saving player:', error.message);
    return false;
  }
}

// Get all players
function getAllPlayers() {
  return loadPlayers();
}

// Get player count
function getPlayerCount() {
  const players = loadPlayers();
  return Object.keys(players).length;
}

// Initialize the database file on module load
initPlayersFile();
console.log('✅ JSON player tracker initialized');

function searchPlayers(searchTerm) {
  const players = loadPlayers();
  return Object.values(players).filter(player => 
    player.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
}

export {
  savePlayer,
  getAllPlayers,
  getPlayerCount,
  searchPlayers
};