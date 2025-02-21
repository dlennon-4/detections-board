document.addEventListener("DOMContentLoaded", function () {
    fetch("detections.json")
        .then(response => response.json())
        .then(data => {
            populateTable(data);
        })
        .catch(error => console.error("Error loading detections:", error));
});

function populateTable(detections) {
    const tableBody = document.getElementById("detectionsTableBody");
    tableBody.innerHTML = ""; // Clear existing rows

    detections.forEach(detection => {
        const row = document.createElement("tr");

        // Helper function to create and append table cells
        function createCell(content) {
            const cell = document.createElement("td");
            cell.textContent = content || "N/A";
            return cell;
        }

        row.appendChild(createCell(detection.name));              // Detection Name
        row.appendChild(createCell(detection.description));       // Description
        row.appendChild(createCell(detection.defaultStatus));     // Default Status
        row.appendChild(createCell(detection.killChainStage));    // Kill Chain Stage
        row.appendChild(createCell(detection.mitreTactic));       // MITRE Tactic
        row.appendChild(createCell(detection.mitreTacticID));     // MITRE Tactic ID
        row.appendChild(createCell(detection.mitreTechnique));    // MITRE Technique
        row.appendChild(createCell(detection.mitreTechniqueID));  // MITRE Technique ID
        row.appendChild(createCell(detection.connector));         // Connector
        row.appendChild(createCell(detection.tool));              // Tool
        
        // 🛠 Fix for "Last Modified" Column
        let lastModified = detection.hasOwnProperty("lastModified") ? detection.lastModified : "N/A";

        // If lastModified exists, reformat from YYYY-MM-DD to MM-DD-YY
        if (lastModified !== "N/A") {
            let dateParts = lastModified.split("-");
            if (dateParts.length === 3) {
                lastModified = `${dateParts[1]}-${dateParts[2]}-${dateParts[0].slice(-2)}`;
            }
        }

        row.appendChild(createCell(lastModified)); // Last Modified Column
        
        tableBody.appendChild(row);
    });
}
