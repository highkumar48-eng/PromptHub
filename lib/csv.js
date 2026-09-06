function parseCSV(csvText) {
  const lines = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          row[row.length - 1] += '"';
          i++; // Skip the second quote
        } else {
          inQuotes = false;
        }
      } else {
        row[row.length - 1] += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push("");
      } else if (char === '\r' || char === '\n') {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        lines.push(row.map(cell => cell.trim()));
        row = [""];
      } else {
        row[row.length - 1] += char;
      }
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row.map(cell => cell.trim()));
  }
  return lines;
}

/**
 * Converts raw parsed CSV matrix to mapped prompt objects.
 */
function convertCSVToPrompts(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return [];

  // Normalize headers (strip spaces, lowercase)
  const headers = rows[0].map(h => h.toLowerCase().replace(/[\s_-]/g, ''));
  const prompts = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Skip empty lines
    if (row.length === 0 || (row.length === 1 && row[0] === "")) continue;

    const promptObj = {};
    headers.forEach((header, index) => {
      const cellValue = row[index] || "";

      // Match key database columns
      if (header.includes('keyword')) {
        promptObj.Keyword = cellValue;
      } else if (header.includes('title')) {
        promptObj.PromptTitle = cellValue;
      } else if (header.includes('text') || header.includes('prompt')) {
        promptObj.PromptText = cellValue;
      } else if (header.includes('image') || header.includes('preview')) {
        promptObj.PreviewImageUrl = cellValue;
      } else if (header.includes('date')) {
        promptObj.CreatedDate = cellValue;
      } else if (header.includes('status')) {
        promptObj.Status = cellValue;
      } else if (header.includes('views')) {
        promptObj.Views = parseInt(cellValue, 10) || 0;
      }
    });

    if (promptObj.Keyword) {
      prompts.push({
        Keyword: promptObj.Keyword,
        PromptTitle: promptObj.PromptTitle || `${promptObj.Keyword} Cinematic Portrait`,
        PromptText: promptObj.PromptText || "",
        PreviewImageUrl: promptObj.PreviewImageUrl || "",
        CreatedDate: promptObj.CreatedDate || new Date().toISOString().split('T')[0],
        Status: promptObj.Status || "Active",
        Views: promptObj.Views || 0,
      });
    }
  }
  return prompts;
}


export { parseCSV, convertCSVToPrompts };

