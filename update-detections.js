const axios = require('axios');
const fs = require('fs');

// Hardcoded board ID
const BOARD_ID = 6523846419;

// Get Monday API Key from environment variable
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
if (!MONDAY_API_KEY) {
  console.error("❌ MONDAY_API_KEY is not set. Exiting.");
  process.exit(1);
}

console.log("🚀 Script Started");
console.log("🔑 API Key Loaded:", MONDAY_API_KEY ? "Yes" : "No");
console.log("📋 Using Board ID:", BOARD_ID);

// Function to fetch all detections using pagination
async function fetchAllMondayItems() {
  let allItems = [];
  let cursor = null;

  do {
    console.log("📡 Fetching data from Monday.com...");

    const query = cursor 
      ? `query { next_items_page(cursor: "${cursor}") { cursor items { id name column_values { id text value } } } }`
      : `query { boards(ids: [${BOARD_ID}]) { items_page { cursor items { id name column_values { id text value } } } } }`;

    console.log("🔗 Sending API Request to Monday.com");

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

      if (response.data.errors) {
        console.error("❌ API Error:", response.data.errors);
        break;
      }

      const page = cursor ? response.data.data.next_items_page : response.data.data.boards[0]?.items_page;
      if (!page) {
        console.error("❌ No page data received!");
        break;
      }

      allItems = allItems.concat(page.items || []);
      cursor = page.cursor;

      console.log(`📥 Retrieved ${allItems.length} detections so far...`);
      console.log(`📌 Pagination Cursor: ${cursor ? cursor : "End of Data"}`);

      // **Added delay to avoid rate limits**
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error("❌ Error fetching data:", error.response?.data || error.message);
      break;
    }

  } while (cursor);

  return allItems;
}

// Function to read current detections.json
function loadCurrentDetections() {
  try {
    console.log("📂 Loading detections.json...");
    const data = fs.readFileSync('detections.json', 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.log("⚠️ detections.json not found, creating a new file.");
    return [];
  }
}

// Function to write updated detections.json
function writeDetections(detections) {
  console.log(`💾 Preparing to write ${detections.length} detections to detections.json...`);
  fs.writeFileSync('detections.json', JSON.stringify(detections, null, 2) + "\n");
  console.log("✅ Detections updated successfully!");
}

// Helper function to extract the best column value
function getColumnValue(cv) {
  if (cv.text && cv.text.trim() !== "") {
    return cv.text;
  }
  if (cv.value) {
    try {
      const parsed = JSON.parse(cv.value);
      if (parsed && parsed.label) return parsed.label;
      if (parsed && parsed.text) return parsed.text;
      return JSON.stringify(parsed);
    } catch (e) {
      return cv.value;
    }
  }
  return "";
}

// Mapping function using column IDs
function mapItemToDetection(item) {
  const columns = {};
  item.column_values.forEach(cv => {
    columns[cv.id] = getColumnValue(cv);
  });

  return {
    detectionID: columns["item_id_mknaww1f"] || item.id,
    name: item.name,
    description: columns["text2__1"] || '',
    defaultStatus: columns["status"] || '',
    killChainStage: columns["text0__1"] || '',
    mitreTactic: columns["text__1"] || '',
    mitreTacticID: columns["text6__1"] || '',
    mitreTechnique: columns["text5__1"] || '',
    mitreTechniqueID: columns["text8__1"] || '',
    connector: columns["text00__1"] || '',
    tool: columns["text_mknaxnaj"] || '',
    dateAdded: columns["date__1"] || ''
  };
}

// Function to update detections.json
async function updateDetections() {
  console.log("🔄 Updating detections...");

  const mondayItems = await fetchAllMondayItems();
  if (mondayItems.length === 0) {
    console.log("⚠️ No detections fetched from Monday.com!");
    return;
  }

  console.log(`📝 Found ${mondayItems.length} detections from Monday.com`);

  const currentDetections = loadCurrentDetections();
  console.log(`📊 Existing Detections Count: ${currentDetections.length}`);

  // Build a map of current detections keyed by detectionID
  const detectionMap = {};
  currentDetections.forEach(det => {
    detectionMap[det.detectionID] = det;
  });

  let newDetections = 0;
  let updatedDetections = 0;

  // Update or add each detection
  mondayItems.forEach(item => {
    const detection = mapItemToDetection(item);
    if (detection) {
      if (!detectionMap[detection.detectionID]) {
        newDetections++;
        console.log(`🆕 New Detection Added: ${detection.name} (ID: ${detection.detectionID})`);
      } else if (JSON.stringify(detectionMap[detection.detectionID]) !== JSON.stringify(detection)) {
        updatedDetections++;
        console.log(`✏️ Modified Detection: ${detection.name} (ID: ${detection.detectionID})`);
      }
      detectionMap[detection.detectionID] = detection;
    }
  });

  // Sort detections A → Z before saving
  const finalDetections = Object.values(detectionMap).sort((a, b) => a.name.localeCompare(b.name));

  console.log(`📌 Total Updated Detections: ${finalDetections.length}`);

  if (newDetections === 0 && updatedDetections === 0) {
    console.log("✅ No changes detected, skipping update.");
    return;
  }

  console.log(`📢 Summary: 🆕 ${newDetections} new detections | ✏️ ${updatedDetections} updated detections`);

  writeDetections(finalDetections);
}

// Run update process
updateDetections();
