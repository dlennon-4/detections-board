const axios = require('axios');
const fs = require('fs');

// Fetch the JSON data
async function fetchDetections() {
    try {
        // Replace 'detections.json' with the actual API URL or file path if necessary
        const response = await axios.get('detections.json');
        const detections = response.data;

        // Process and format data
        processDetections(detections);
    } catch (error) {
        console.error("Error loading detections:", error.message);
    }
}

// Process detections and format the date
function processDetections(detections) {
    detections.forEach(detection => {
        let lastModified = detection.lastModified ? detection.lastModified : "N/A";
        
        // Ensure lastModified is formatted as MM-DD-YY
        if (lastModified !== "N/A" && lastModified.includes("-")) {
            let dateParts = lastModified.split("-");
            if (dateParts.length === 3) {
                lastModified = `${dateParts[1]}-${dateParts[2]}-${dateParts[0].slice(-2)}`;
            }
        }

        console.log(`Detection: ${detection.name}, Last Modified: ${lastModified}`);
    });
}

// Run the function
fetchDetections();
