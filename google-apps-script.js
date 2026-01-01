// ============================================
// PULL ALL THE THINGS - GUILD ROSTER
// Google Apps Script Backend
// ============================================
//
// This script manages two sheets:
// 1. Availability - One row per Discord user (1:1 relationship)
// 2. Characters - Multiple rows per Discord user (1:many relationship)
//
// SETUP INSTRUCTIONS:
// 1. Create a new Google Sheet
// 2. Go to Extensions > Apps Script
// 3. Delete any existing code and paste this entire file
// 4. Click "Deploy" > "New deployment"
// 5. Select type: "Web app"
// 6. Set "Execute as": Me
// 7. Set "Who has access": Anyone
// 8. Click "Deploy" and authorize when prompted
// 9. Copy the Web app URL and paste it into BOTH roster.html and roster-view.html
// ============================================

const AVAILABILITY_SHEET = 'Availability';
const CHARACTERS_SHEET = 'Characters';

// Handle form submissions (POST)
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // Update or create availability record
    updateAvailability(data);
    
    // If this is a new MAIN, demote any existing main to Alt
    if (data.mainAlt === 'Main') {
      demoteExistingMain(data.discordName);
    }
    
    // Add the character
    addCharacter(data);
    
    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Return roster data (GET)
function doGet(e) {
  try {
    const availability = getAvailabilityData();
    const characters = getCharactersData();
    
    return ContentService
      .createTextOutput(JSON.stringify({ 
        success: true, 
        availability: availability,
        characters: characters 
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// AVAILABILITY FUNCTIONS
// ============================================

function getOrCreateAvailabilitySheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(AVAILABILITY_SHEET);
  
  if (!sheet) {
    sheet = ss.insertSheet(AVAILABILITY_SHEET);
    const headers = ['Discord', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Notes', 'Updated'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    formatHeaderRow(sheet, headers.length);
  }
  
  return sheet;
}

function updateAvailability(data) {
  const sheet = getOrCreateAvailabilitySheet();
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const discordCol = headers.indexOf('Discord');
  
  // Find existing row for this Discord user
  let existingRow = -1;
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][discordCol].toString().toLowerCase() === data.discordName.toLowerCase()) {
      existingRow = i + 1; // Sheet rows are 1-indexed
      break;
    }
  }
  
  const availability = data.availability || {};
  const rowData = [
    data.discordName,
    availability.Monday || false,
    availability.Tuesday || false,
    availability.Wednesday || false,
    availability.Thursday || false,
    availability.Friday || false,
    availability.Saturday || false,
    availability.Sunday || false,
    data.availabilityNotes || '',
    new Date()
  ];
  
  if (existingRow > 0) {
    // Update existing row
    sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    // Add new row
    sheet.appendRow(rowData);
  }
}

function getAvailabilityData() {
  const sheet = getOrCreateAvailabilitySheet();
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) return [];
  
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      // Normalize header names to lowercase for days
      const key = header.toLowerCase();
      obj[key] = row[i];
    });
    return obj;
  });
}

// ============================================
// CHARACTERS FUNCTIONS
// ============================================

function getOrCreateCharactersSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CHARACTERS_SHEET);
  
  if (!sheet) {
    sheet = ss.insertSheet(CHARACTERS_SHEET);
    const headers = ['Discord', 'Character', 'Class', 'Spec', 'Role', 'Main/Alt', 'Created', 'Updated'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    formatHeaderRow(sheet, headers.length);
  }
  
  return sheet;
}

function demoteExistingMain(discordName) {
  const sheet = getOrCreateCharactersSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const discordCol = headers.indexOf('Discord');
  const mainAltCol = headers.indexOf('Main/Alt');
  const updatedCol = headers.indexOf('Updated');
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][discordCol].toString().toLowerCase() === discordName.toLowerCase() && 
        data[i][mainAltCol] === 'Main') {
      sheet.getRange(i + 1, mainAltCol + 1).setValue('Alt');
      sheet.getRange(i + 1, updatedCol + 1).setValue(new Date());
    }
  }
}

function addCharacter(data) {
  const sheet = getOrCreateCharactersSheet();
  const now = new Date();
  
  const row = [
    data.discordName,
    data.characterName,
    data.className,
    data.spec,
    data.role,
    data.mainAlt,
    now,
    now
  ];
  
  sheet.appendRow(row);
  
  // Apply class color styling
  applyClassColor(sheet, sheet.getLastRow(), data.className);
}

function getCharactersData() {
  const sheet = getOrCreateCharactersSheet();
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) return [];
  
  const headers = data[0];
  return data.slice(1).map(row => {
    return {
      discord: row[headers.indexOf('Discord')],
      character: row[headers.indexOf('Character')],
      class: row[headers.indexOf('Class')],
      spec: row[headers.indexOf('Spec')],
      role: row[headers.indexOf('Role')],
      mainAlt: row[headers.indexOf('Main/Alt')]
    };
  });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatHeaderRow(sheet, numCols) {
  const headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1a1a2e');
  headerRange.setFontColor('#ffd700');
  sheet.setFrozenRows(1);
  
  for (let i = 1; i <= numCols; i++) {
    sheet.autoResizeColumn(i);
  }
}

function applyClassColor(sheet, row, className) {
  const classColors = {
    'Death Knight': '#C41E3A',
    'Demon Hunter': '#A330C9',
    'Druid': '#FF7C0A',
    'Evoker': '#33937F',
    'Hunter': '#AAD372',
    'Mage': '#3FC7EB',
    'Monk': '#00FF98',
    'Paladin': '#F48CBA',
    'Priest': '#808080', // Using gray instead of white for visibility
    'Rogue': '#FFF468',
    'Shaman': '#0070DD',
    'Warlock': '#8788EE',
    'Warrior': '#C69B6D'
  };
  
  const color = classColors[className];
  if (color) {
    // Color the Character and Class columns
    sheet.getRange(row, 2).setFontColor(color); // Character
    sheet.getRange(row, 3).setFontColor(color); // Class
  }
}

// ============================================
// OFFICER UTILITY FUNCTIONS
// Run these manually from the Apps Script editor
// ============================================

/**
 * Get a summary of your raid roster
 * Run this from the editor: Run > getRosterSummary
 * Then check View > Logs
 */
function getRosterSummary() {
  const characters = getCharactersData();
  const availability = getAvailabilityData();
  const mains = characters.filter(c => c.mainAlt === 'Main');
  
  const summary = {
    totalPlayers: availability.length,
    totalCharacters: characters.length,
    mains: mains.length,
    alts: characters.length - mains.length,
    tanks: mains.filter(c => c.role === 'Tank').length,
    healers: mains.filter(c => c.role === 'Healer').length,
    dps: mains.filter(c => c.role === 'DPS').length
  };
  
  // Availability by day
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const availByDay = {};
  days.forEach(day => {
    availByDay[day] = availability.filter(p => p[day] === true || p[day] === 'TRUE').length;
  });
  
  Logger.log('========== ROSTER SUMMARY ==========');
  Logger.log('Total Players: ' + summary.totalPlayers);
  Logger.log('Total Characters: ' + summary.totalCharacters);
  Logger.log('Mains: ' + summary.mains + ' | Alts: ' + summary.alts);
  Logger.log('');
  Logger.log('ROLE BREAKDOWN (Mains only):');
  Logger.log('  Tanks: ' + summary.tanks);
  Logger.log('  Healers: ' + summary.healers);
  Logger.log('  DPS: ' + summary.dps);
  Logger.log('');
  Logger.log('AVAILABILITY BY DAY:');
  days.forEach(day => {
    const pct = summary.totalPlayers > 0 ? Math.round((availByDay[day] / summary.totalPlayers) * 100) : 0;
    Logger.log('  ' + day.charAt(0).toUpperCase() + day.slice(1) + ': ' + availByDay[day] + '/' + summary.totalPlayers + ' (' + pct + '%)');
  });
  
  return summary;
}

/**
 * Remove a player entirely (availability + all characters)
 * Edit the discord name below, then run
 */
function removePlayer() {
  const discordName = 'ENTER_DISCORD_NAME_HERE'; // <-- Change this
  
  if (discordName === 'ENTER_DISCORD_NAME_HERE') {
    Logger.log('ERROR: Please edit the discordName variable before running');
    return;
  }
  
  // Remove from availability
  const availSheet = getOrCreateAvailabilitySheet();
  const availData = availSheet.getDataRange().getValues();
  for (let i = availData.length - 1; i >= 1; i--) {
    if (availData[i][0].toString().toLowerCase() === discordName.toLowerCase()) {
      availSheet.deleteRow(i + 1);
      Logger.log('Removed availability for: ' + discordName);
    }
  }
  
  // Remove from characters
  const charSheet = getOrCreateCharactersSheet();
  const charData = charSheet.getDataRange().getValues();
  let removedCount = 0;
  for (let i = charData.length - 1; i >= 1; i--) {
    if (charData[i][0].toString().toLowerCase() === discordName.toLowerCase()) {
      charSheet.deleteRow(i + 1);
      removedCount++;
    }
  }
  Logger.log('Removed ' + removedCount + ' character(s) for: ' + discordName);
}

/**
 * Remove a specific character by name
 * Edit the character name below, then run
 */
function removeCharacter() {
  const characterName = 'ENTER_CHARACTER_NAME_HERE'; // <-- Change this
  
  if (characterName === 'ENTER_CHARACTER_NAME_HERE') {
    Logger.log('ERROR: Please edit the characterName variable before running');
    return;
  }
  
  const sheet = getOrCreateCharactersSheet();
  const data = sheet.getDataRange().getValues();
  
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1].toString().toLowerCase() === characterName.toLowerCase()) {
      sheet.deleteRow(i + 1);
      Logger.log('Removed character: ' + characterName);
      return;
    }
  }
  
  Logger.log('Character not found: ' + characterName);
}

/**
 * Clean up duplicate character entries (keeps the newest)
 */
function cleanupDuplicateCharacters() {
  const sheet = getOrCreateCharactersSheet();
  const data = sheet.getDataRange().getValues();
  
  const seen = {};
  const rowsToDelete = [];
  
  // Go through newest first (bottom of sheet)
  for (let i = data.length - 1; i >= 1; i--) {
    const key = (data[i][0] + '|' + data[i][1]).toLowerCase(); // discord|character
    
    if (seen[key]) {
      rowsToDelete.push(i + 1);
    } else {
      seen[key] = true;
    }
  }
  
  // Delete rows
  rowsToDelete.forEach(rowNum => {
    sheet.deleteRow(rowNum);
  });
  
  Logger.log('Removed ' + rowsToDelete.length + ' duplicate character entries');
}

/**
 * Manually set a character as Main (useful for fixing mistakes)
 * This will demote any other main for that discord user
 */
function setCharacterAsMain() {
  const discordName = 'ENTER_DISCORD_NAME_HERE'; // <-- Change this
  const characterName = 'ENTER_CHARACTER_NAME_HERE'; // <-- Change this
  
  if (discordName === 'ENTER_DISCORD_NAME_HERE' || characterName === 'ENTER_CHARACTER_NAME_HERE') {
    Logger.log('ERROR: Please edit both variables before running');
    return;
  }
  
  const sheet = getOrCreateCharactersSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const discordCol = headers.indexOf('Discord');
  const charCol = headers.indexOf('Character');
  const mainAltCol = headers.indexOf('Main/Alt');
  const updatedCol = headers.indexOf('Updated');
  
  let foundTarget = false;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][discordCol].toString().toLowerCase() === discordName.toLowerCase()) {
      if (data[i][charCol].toString().toLowerCase() === characterName.toLowerCase()) {
        // This is the target - set to Main
        sheet.getRange(i + 1, mainAltCol + 1).setValue('Main');
        sheet.getRange(i + 1, updatedCol + 1).setValue(new Date());
        foundTarget = true;
        Logger.log('Set ' + characterName + ' as Main');
      } else if (data[i][mainAltCol] === 'Main') {
        // This is another main - demote to Alt
        sheet.getRange(i + 1, mainAltCol + 1).setValue('Alt');
        sheet.getRange(i + 1, updatedCol + 1).setValue(new Date());
        Logger.log('Demoted ' + data[i][charCol] + ' to Alt');
      }
    }
  }
  
  if (!foundTarget) {
    Logger.log('Character not found: ' + characterName + ' for discord: ' + discordName);
  }
}
