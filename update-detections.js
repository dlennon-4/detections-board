const axios = require('axios');
const fs = require('fs');

// Hardcode board ID as a number
const BOARD_ID = 6523846419;

// Use your Monday API key from the environment variable
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
if (!MONDAY_API_KEY) {
  console.error("MONDAY_API_KEY is not set.");
  process.exit(1);
}

// Query for groups and their pulses (the underlying field for items on older boards)
const query = `query { boards(ids: [${BOARD_ID}]) { id name groups { id title pulses { id name column_values { title text value } } } } }`;
console.log("Final Query:", query);

async function fetchMondayData() {
  try {
    const response = await axios({
      url: 'https://api.monday.com/v2/',
      method: 'post',
      headers: {
        'Authorization': MONDAY_API_KEY,
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({ query: query })
    });
    
    const boards = response.data.data.boards;
    if (!boards || boards.length === 0) {
      console.error("No board found.");
      process.exit(1);
    }
    const board = boards[0];
    // Flatten pulses from all groups into a single array.
    let items = [];
    if (board.groups && board.groups.length > 0) {
      board.groups.forEach(group => {
        if (group.pulses && group.pulses.length > 0) {
          items = items.concat(group.pulses);
        }
      });
    }
    return items;
  } catch (error) {
    if (error.response && error.response.data) {
      console.error("Error response data:", error.response.data);
    }
    console.error("Error fetching Monday data:", error.message);
    process.exit(1);
  }
}

function loadCurrentDetections() {
  try {
    const data = fs.readFileSync('detections.json', 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If detections.json doesn't exist, return an empty array.
    return [];
  }
}

function writeDetections(detections) {
  fs.writeFileSync('detections.json', JSON.stringify(detections, null, 2));
}

// Helper function to extract the best available column value.
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

// Map a Monday.com pulse (detection) to your detection JSON structure.
function mapItemToDetection(item) {
  const columns = {};
  item.column_values.forEach(cv => {
    // Use the column title as the key.
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

async function updateDetections() {
  const mondayItems = await fetchMondayData();
  const currentDetections = loadCurrentDetections();
  
  // Build a map of current detections keyed by detectionID.
  const detectionMap = {};
  currentDetections.forEach(det => {
    detectionMap[det.detectionID] = det;
  });
  
  // Update or add each pulse from Monday.com.
  mondayItems.forEach(item => {
    const detection = mapItemToDetection(item);
    detectionMap[detection.detectionID] = detection;
  });
  
  const updatedDetections = Object.values(detectionMap);
  writeDetections(updatedDetections);
  console.log("Detections updated successfully!");
}

updateDetections();
