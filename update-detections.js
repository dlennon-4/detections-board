const axios = require('axios');
const fs = require('fs');
const nodemailer = require('nodemailer'); // For Gmail SMTP

// Hardcoded board ID
const BOARD_ID = 6523846419;

// Get Monday API Key from environment variable
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
if (!MONDAY_API_KEY) {
  console.error("❌ MONDAY_API_KEY is not set. Exiting.");
  process.exit(1);
}

console.log("🚀 Script Started");
console.log("📋 Using Board ID:", BOARD_ID);

// Function to format a Date object (or a date string) into MM-DD-YYYY format
function formatDate(dateInput) {
  let date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return "⚠️ Invalid Date!";
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}-${day}-${year}`;
}

// Function to fetch all detections from Monday.com using pagination
async function fetchAllMondayItems() {
  let allItems = [];
  let cursor = null;

  do {
    console.log("📡 Fetching data from Monday.com...");

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

      if (response.data.errors) {
        console.error("❌ API Error:", response.data.errors);
        break;
      }

      const page = cursor
        ? response.data.data.next_items_page
        : response.data.data.boards[0]?.items_page;

      if (!page) {
        console.error("❌ No page data received!");
        break;
      }

      allItems = allItems.concat(page.items || []);
      cursor = page.cursor;

      console.log(`📥 Retrieved ${allItems.length} detections so far...`);

      // Delay to help avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error("❌ Error fetching data:", error.response?.data || error.message);
      break;
    }
  } while (cursor);

  return allItems;
}

// Function to load current detections from detections.json
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

// Function to write updated detections to detections.json
function writeDetections(detections) {
  console.log(`💾 Writing ${detections.length} detections to detections.json...`);
  fs.writeFileSync('detections.json', JSON.stringify(detections, null, 2) + "\n");
  console.log("✅ Detections updated successfully!");
}

// Function to write an update summary for email notification
function writeSummary(newDetections, updatedDetections, deletedDetections) {
  const summaryContent = `
🛠 Detections Update Summary
----------------------------
🆕 New Detections: ${newDetections.length}
✏️ Updated Detections: ${updatedDetections.length}
🗑️ Deleted Detections: ${deletedDetections.length}

📋 Details:
${newDetections.map(d => `🆕 New: ${d.name} (ID: ${d.detectionID}) Added on: ${d.dateAdded}`).join("\n")}
${updatedDetections.map(d => `✏️ Updated: ${d.name} (ID: ${d.detectionID})`).join("\n")}
${deletedDetections.map(d => `🗑️ Deleted: ${d.name} (ID: ${d.detectionID})`).join("\n")}
  `;
  fs.writeFileSync('update-summary.txt', summaryContent.trim());
  console.log("✅ Summary saved to update-summary.txt");
}

// Mapping function: Convert a Monday.com item to a detection object.
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
    tool: columns["text_mknaxnaj"] || ''
  };
}

// Update detections: fetch Monday items, compare with current detections, and update detections.json.
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

  // Build a map of current detections by detectionID.
  const detectionMap = {};
  currentDetections.forEach(det => {
    // If a detection lacks a dateAdded, default it to "01-01-2025"
    if (!det.dateAdded) det.dateAdded = "01-01-2025";
    detectionMap[det.detectionID] = det;
  });

  let newDetections = [];
  let updatedDetections = [];
  let deletedDetections = [];

  // Process each Monday item.
  mondayItems.forEach(item => {
    const detection = mapItemToDetection(item);

    // ⛔️ Skip any detection that is "Awaiting Approval"
    if (detection.defaultStatus === "Awaiting Approval") {
      return;
    }

    // If detection is brand-new, stamp it with today’s date
    if (!detectionMap[detection.detectionID]) {
      detection.dateAdded = formatDate(new Date());
      newDetections.push(detection);

    } else {
      // Otherwise preserve original dateAdded
      detection.dateAdded = detectionMap[detection.detectionID].dateAdded;
      // If any other field changed, mark it updated
      if (JSON.stringify(detectionMap[detection.detectionID]) !== JSON.stringify(detection)) {
        updatedDetections.push(detection);
      }
    }

    // Write/overwrite into our map
    detectionMap[detection.detectionID] = detection;
  });

  // Now figure out which ones to delete:
  // Any detection in our old JSON that did NOT appear (as a non-Awaiting-Approval)
  // in Monday’s feed should be removed.
  const mondayDetectionIDs = new Set(
    mondayItems
      .map(item => mapItemToDetection(item))
      .filter(det => det.defaultStatus !== "Awaiting Approval")
      .map(det => det.detectionID)
  );

  Object.keys(detectionMap).forEach(detectionID => {
    if (!mondayDetectionIDs.has(detectionID)) {
      deletedDetections.push(detectionMap[detectionID]);
      delete detectionMap[detectionID];
    }
  });

  // Sort remaining detections alphabetically and write everything out
  const finalDetections = Object.values(detectionMap)
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log(`📢 Summary: 🆕 ${newDetections.length} new | ✏️ ${updatedDetections.length} updated | 🗑️ ${deletedDetections.length} deleted`);
  writeSummary(newDetections, updatedDetections, deletedDetections);
  writeDetections(finalDetections);

  // Fire off your email notification
  await sendEmail();
}

// Send update summary via Gmail (Nodemailer)
async function sendEmail() {
  let summary;
  try {
    summary = fs.readFileSync('update-summary.txt', 'utf8');
  } catch (err) {
    console.error("❌ Could not read update-summary.txt:", err);
    return;
  }

  const summaryHTML = summary.replace(/\n/g, '<br>');

  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: 'dan@cyflare.com',
    subject: 'Detection Board Update: Summary Report',
    html: summaryHTML
  };

  try {
    let info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent: ' + info.response);
  } catch (error) {
    console.error('❌ Error sending email:', error);
  }
}

// Kick it all off
updateDetections();
