const axios = require('axios');
const fs = require('fs');

// Hardcoded board id (as a number)
const BOARD_ID = 6523846419;

// Use your Monday API key from the environment variable
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;

if (!MONDAY_API_KEY) {
  console.error("MONDAY_API_KEY is not set.");
  process.exit(1);
}

// Single-line GraphQL query using cv.title to get column names
const query = `query { boards(ids: [${BOARD_ID}]) { items { id name column_values { title text } } } }`;
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
      data: JSON.stringify({ query })
    });
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
    // If detections.json doesn't exist, return an empty array
    return [];
  }
}

function writeDetections(detections) {
  fs.writeFileSync('detections.json', JSON.stringify(detections, null, 2));
}

// Map Monday.com item to your detection JSON structure using your custom column titles.
function mapItemToDetection(item) {
  const columns = {};
  item.column_values.forEach(cv => {
    // Use cv.title for mapping keys.
    columns[cv.title] = cv.text;
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
  
  // Process each item from Monday.com: update if exists or add if new.
  mondayItems.forEach(item => {
    const detection = mapItemToDetection(item);
    detectionMap[detection.detectionID] = detection;
  });
  
  const updatedDetections = Object.values(detectionMap);
  writeDetections(updatedDetections);
  console.log("Detections updated successfully!");
}

updateDetections();
