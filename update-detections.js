// Remove later, just for debugging
console.log("BOARD_ID is:", JSON.stringify(process.env.MONDAY_BOARD_ID));

// update-detections.js
const axios = require('axios');
const fs = require('fs');

// Retrieve your Monday API key and board id from environment variables
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
const BOARD_ID = process.env.MONDAY_BOARD_ID; // e.g., "123456789"

// Define the GraphQL query to fetch items from the board.
// This query retrieves the board by id and gets all items with their column values.
const query = `
query {
  boards(ids: ${BOARD_ID}) {
    items {
      id
      name
      column_values {
        id
        text
      }
    }
  }
}
`;

async function fetchMondayData() {
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
    // Returns an array of items from your board
    return response.data.data.boards[0].items;
  } catch (error) {
    console.error("Error fetching Monday data:", error);
    process.exit(1);
  }
}

function loadCurrentDetections() {
  try {
    const data = fs.readFileSync('detections.json', 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If detections.json does not exist, return an empty array
    return [];
  }
}

function writeDetections(detections) {
  fs.writeFileSync('detections.json', JSON.stringify(detections, null, 2));
}

// Map a Monday.com item to your detection JSON structure
function mapItemToDetection(item) {
  // Create an object mapping column IDs to their text values.
  const columns = {};
  item.column_values.forEach(cv => {
    columns[cv.id] = cv.text;
  });
  
  return {
    // Use the custom detection_id column if present; otherwise, fallback to the Monday item id.
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

async function updateDetections() {
  // 1. Fetch latest data from Monday.com
  const mondayItems = await fetchMondayData();
  
  // 2. Load current detections from detections.json
  const currentDetections = loadCurrentDetections();
  
  // 3. Build a map (object) of current detections keyed by detectionID
  const detectionMap = {};
  currentDetections.forEach(det => {
    detectionMap[det.detectionID] = det;
  });
  
  // 4. Process each Monday.com item: update if detectionID exists; add if new
  mondayItems.forEach(item => {
    const detection = mapItemToDetection(item);
    detectionMap[detection.detectionID] = detection;
  });
  
  // 5. Convert the map back to an array and write to detections.json
  const updatedDetections = Object.values(detectionMap);
  writeDetections(updatedDetections);
  
  console.log("Detections updated successfully!");
}

updateDetections();
