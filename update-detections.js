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

// Function to format date from YYYY-MM-DD to MM-DD-YY
function formatDate(dateString) {
    if (!dateString) return "⚠️ Missing Date!";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "⚠️ Invalid Date!";
    const month = String(date.getMonth() + 1).padStart(2, '0'); // MM
    const day = String(date.getDate()).padStart(2, '0'); // DD
    const year = String(date.getFullYear()).slice(-2); // YY
    return `${month}-${day}-${year}`;
}

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

      await new Promise(resolve => setTimeout(resolve, 1000)); // Delay to avoid rate limits

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

// Function to map detections
function mapItemToDetection(item) {
  const columns = {};
  item.column_values.forEach(cv => {
    columns[cv.id] = cv.text || cv.value || ''; 
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
    lastModified: columns["date__1"] ? formatDate(columns["date__1"]) : "⚠️ Missing Date!"
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

  const finalDetections = mondayItems.map(mapItemToDetection);

  console.log(`📢 Summary: Updated ${finalDetections.length} detections`);
  writeDetections(finalDetections);
}

// Run update process
updateDetections();
