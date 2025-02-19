const axios = require('axios');
const fs = require('fs');

// Hardcoded board ID
const BOARD_ID = 6523846419;

// Get Monday API Key from GitHub secrets
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
if (!MONDAY_API_KEY) {
  console.error("MONDAY_API_KEY is not set.");
  process.exit(1);
}

// Function to fetch all items using cursor-based pagination
async function fetchAllMondayItems() {
  let allItems = [];
  let cursor = null;

  do {
    const query = cursor 
      ? `query { next_items_page(cursor: "${cursor}") { cursor items { id name column_values { title text value } } } }`
      : `query { boards(ids: [${BOARD_ID}]) { items_page { cursor items { id name column_values { title text value } } } } }`;
      
    const response = await axios({
      url: 'https://api.monday.com/v2/',
      method: 'post',
      headers: {
        'Authorization': MONDAY_API_KEY,
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({ query })
    });

    if (cursor) {
      const page = response.data.data.next_items_page;
      allItems = allItems.concat(page.items);
      cursor = page.cursor;
    } else {
      const page = response.data.data.boards[0].items_page;
      allItems = allItems.concat(page.items);
      cursor = page.cursor;
    }

  } while (cursor);

  console.log("Retrieved Items:", JSON.stringify(allItems, null, 2)); // Debug log
  return allItems;
}

// Function to read current detections.json
function loadCurrentDetections() {
  try {
    const data = fs.readFileSync('detections.json', 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.log("detections.json not found, creating a new file.");
    return [];
  }
}

// Function to write updated detections.json
function writeDetections(detections) {
  fs.writeFileSync('detections.json', JSON.stringify(detections, null, 2) + "\n"); // Force newline to ensure Git detects change
}

// Helper function to extract the best column value
function getColumnValue(cv) {
  if (cv.text && cv.text.trim() !== "") {
    return cv.text;
  }
  if (cv.value) {
    try {
      const parsed = JSON.parse(cv.value);
      if (parsed && parsed.label) {
        return parsed.label;
      }
      if (parsed && parsed.text) {
        return parsed.text;
      }
      return JSON.stringify(parsed);
    } catch (e) {
      return cv.value;
    }
  }
  return "";
}

// Mapping function for Monday.com data
function mapItemToDetection(item) {
  const columns = {};
  item.column_values.forEach(cv => {
    columns[cv.title] = getColumnValue(cv);
  });

  return {
    detectionID: columns['Detection ID'] || item.id,
    name: item.name,
    description: columns['Description'] || '',
    defaultStatus: columns['Default Status'] || '',
    killChainStage: columns['Kill Chain Stage'] || '',
    mitreTactic: columns['MITRE Tactic'] || '',
    mitreTacticID: columns['MITRE Tactic ID'] || '',
    mitreTechnique: columns['MITRE Tech'] || '',
    mitreTechniqueID: columns['MITRE Tech ID'] || '',
    connector: columns['Connector'] || '',
    tool: columns['Tool'] || '',
    dateAdded: columns['Date Activated'] || ''
  };
}

// Function to update detections.json
async function updateDetections() {
  const mondayItems = await fetchAllMondayItems();
  const currentDetections = loadCurrentDetections();

  console.log("Current Detections JSON Before Update:", JSON.stringify(currentDetections, null, 2)); // Debugging log

  // Build a map of current detections keyed by detectionID.
  const detectionMap = {};
  currentDetections.forEach(det => {
    detectionMap[det.detectionID] = det;
  });

  // Update or add each detection
  mondayItems.forEach(item => {
    const detection = mapItemToDetection(item);
    detectionMap[detection.detectionID] = detection;
  });

  const updatedDetections = Object.values(detectionMap);

  console.log("Newly Retrieved Detections JSON:", JSON.stringify(updatedDetections, null, 2)); // Debugging log

  // Compare JSONs to check if there's an actual change
  if (JSON.stringify(currentDetections) === JSON.stringify(updatedDetections)) {
    console.log("No changes detected, skipping update.");
    return;
  }

  writeDetections(updatedDetections);
  console.log("Detections updated successfully!");
}

updateDetections();
