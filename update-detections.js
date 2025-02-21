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

// Function to fetch all detections using pagination
async function fetchAllMondayItems() {
  let allItems = [];
  let cursor = null;

  do {
    console.log("Fetching detections from Monday.com...");

    const query = cursor 
      ? `query { next_items_page(cursor: "${cursor}") { cursor items { id name column_values { id text value } } } }`
      : `query { boards(ids: [${BOARD_ID}]) { items_page { cursor items { id name column_values { id text value } } } } }`;

    try {
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

      console.log(`Retrieved ${allItems.length} detections so far...`);
      
      // **Added delay to avoid rate limits**
      await new Promise(resolve => setTimeout(resolve, 1000)); 

    } catch (error) {
      console.error("Error response data:", error.response?.data || error.message);
      break; // Stop fetching if we hit an error
    }

  } while (cursor);

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

// Mapping function using **column IDs** instead of column titles
function mapItemToDetection(item) {
  const columns = {};
  item.column_values.forEach(cv => {
    columns[cv.id] = getColumnValue(cv); // ✅ Use column ID instead of title
  });

  return {
    detectionID: columns["item_id_mknaww1f"] || item.id,  // ✅ Detection ID
    name: item.name,
    description: columns["text2__1"] || '',  // ✅ Description
    defaultStatus: columns["status"] || '',  // ✅ Default Status
    killChainStage: columns["text0__1"] || '',  // ✅ Kill Chain Stage
    mitreTactic: columns["text__1"] || '',  // ✅ MITRE Tactic
    mitreTacticID: columns["text6__1"] || '',  // ✅ MITRE Tactic ID
    mitreTechnique: columns["text5__1"] || '',  // ✅ MITRE Technique
    mitreTechniqueID: columns["text8__1"] || '',  // ✅ MITRE Technique ID
    connector: columns["text00__1"] || '',  // ✅ Connector
    tool: columns["text_mknaxnaj"] || '',  // ✅ Tool
    dateAdded: columns["date__1"] || ''  // ✅ Date Activated
  };
}

// Function to update detections.json
async function updateDetections() {
  const mondayItems = await fetchAllMondayItems();
  const currentDetections = loadCurrentDetections();

  console.log("Current Detections JSON Before Update:", JSON.stringify(currentDetections, null, 2));

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

  // ✅ Sort detections A → Z by name before saving
  const updatedDetections = Object.values(detectionMap).sort((a, b) => a.name.localeCompare(b.name));

  console.log("Newly Retrieved Detections JSON (Sorted A→Z):", JSON.stringify(updatedDetections, null, 2));

  // Compare JSONs to check if there's an actual change
  if (JSON.stringify(currentDetections) === JSON.stringify(updatedDetections)) {
    console.log("No changes detected, skipping update.");
    return;
  }

  writeDetections(updatedDetections);
  console.log("Detections updated successfully!");
}
