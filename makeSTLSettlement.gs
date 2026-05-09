const SPREADSHEET_ID = "1SY3Wg9wFm1Gz_e1KFbwS5J7rSQmyymYbtnlMmanw7Z0";

const FOLDER_URLS = [
  "https://drive.google.com/drive/folders/1iugD5rTtMDT6U15nLzQwr-ThlTeiJmHH?usp=drive_link",
  "https://drive.google.com/drive/folders/1IoCVGdDDpqjz4fZy1G14Og6l6r8epHQh?usp=drive_link",
  "https://drive.google.com/drive/folders/1DjwZXcYbUiDCyyJ4JYOpcBEzCqMAsCHc?usp=drive_link",
  "https://drive.google.com/drive/folders/14mJ74gT2LwLY_k5AUh3a0NU0QZbFfLLy?usp=drive_link",
  "https://drive.google.com/drive/folders/1BHgJ2IM17KSMPzl8sSJB0fOhjchweb2h?usp=drive_link"
];

const CAD_TYPES = [
  "crown_cad",
  "inlay_cad",
  "waxup_cad",
  "bridge_cad",
  "abutment_cad"
];

const ANTERIOR = new Set([
  "11", "12", "13", "21", "22", "23",
  "31", "32", "33", "41", "42", "43"
]);

const POSTERIOR = new Set([
  "14", "15", "16", "17", "18",
  "24", "25", "26", "27", "28",
  "34", "35", "36", "37", "38",
  "44", "45", "46", "47", "48"
]);

const VALID_TEETH = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18",
  "21", "22", "23", "24", "25", "26", "27", "28",
  "31", "32", "33", "34", "35", "36", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48",
  "51", "52", "53", "54", "55",
  "61", "62", "63", "64", "65",
  "71", "72", "73", "74", "75",
  "81", "82", "83", "84", "85"
]);

function makeSTLSettlement() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const fileRows = [];
  const toothRows = [];

  const summary = {};
  const toothSummary = {};

  FOLDER_URLS.forEach((url, index) => {
    const folderId = extractFolderId(url);
    const folder = DriveApp.getFolderById(folderId);
    const folderLabel = `폴더${index + 1}`;

    scanFolder(
      folder,
      folderLabel,
      folder.getName(),
      fileRows,
      toothRows,
      summary,
      toothSummary
    );
  });

  writeFileListSheet(ss, fileRows);
  writeToothSummarySheet(ss, toothSummary);
  writeSummarySheet(ss, summary);

  SpreadsheetApp.flush();
}

function scanFolder(folder, folderLabel, path, fileRows, toothRows, summary, toothSummary) {
  if (isRedoFolder(folder.getName())) {
    return;
  }

  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName();

    if (!fileName.toLowerCase().endsWith(".stl")) {
      continue;
    }

    const analysis = analyzeFileName(fileName);

    if (!analysis.cadType) {
      fileRows.push([
        folderLabel,
        path,
        fileName,
        "분류불가",
        "",
        "분류불가",
        "",
        1,
        file.getUrl()
      ]);

      addSummary(summary, "분류불가", 1, 1);
      continue;
    }

    const teeth = analysis.teeth;
    const unitCount = teeth.length > 0 ? teeth.length : 1;
    const settlementCategory = getSettlementCategory(analysis.cadType, teeth);

    fileRows.push([
      folderLabel,
      path,
      fileName,
      analysis.cadType,
      teeth.join(", "),
      settlementCategory,
      getAreaLabel(teeth),
      unitCount,
      file.getUrl()
    ]);

    addSummary(summary, settlementCategory, 1, unitCount);

    if (teeth.length > 0) {
      teeth.forEach(tooth => {
        const area = getSingleToothArea(tooth);

        toothRows.push([
          settlementCategory,
          tooth,
          area,
          fileName,
          analysis.cadType,
          file.getUrl()
        ]);

        const key = `${settlementCategory}__${tooth}__${area}`;
        toothSummary[key] = (toothSummary[key] || 0) + 1;
      });
    } else {
      const key = `${settlementCategory}__치식미확인__미확인`;
      toothSummary[key] = (toothSummary[key] || 0) + 1;
    }
  }

  const subFolders = folder.getFolders();

  while (subFolders.hasNext()) {
    const sub = subFolders.next();

    scanFolder(
      sub,
      folderLabel,
      `${path} / ${sub.getName()}`,
      fileRows,
      toothRows,
      summary,
      toothSummary
    );
  }
}

function isRedoFolder(name) {
  return name.toLowerCase() === "redo";
}

function analyzeFileName(fileName) {
  const lower = fileName.toLowerCase();

  let cadType = "";

  for (const type of CAD_TYPES) {
    if (lower.includes(type)) {
      cadType = type;
      break;
    }
  }

  if (!cadType) {
    return {
      cadType: "",
      teeth: []
    };
  }

  const baseName = fileName.replace(/\.[^/.]+$/, "");
  const lowerBase = baseName.toLowerCase();
  const typeIndex = lowerBase.indexOf(cadType);
  const prefix = typeIndex >= 0 ? baseName.slice(0, typeIndex) : baseName;

  const teeth = extractTeeth(prefix);

  return {
    cadType,
    teeth
  };
}

function extractTeeth(text) {
  const found = new Set();

  const rangeRegex = /(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])\s*[-~]\s*(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])/g;

  let rangeMatch;

  while ((rangeMatch = rangeRegex.exec(text)) !== null) {
    const expanded = expandDentalRange(rangeMatch[1], rangeMatch[2]);
    expanded.forEach(t => found.add(t));
  }

  const toothRegex = /\b(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])\b/g;

  let match;

  while ((match = toothRegex.exec(text)) !== null) {
    if (VALID_TEETH.has(match[1])) {
      found.add(match[1]);
    }
  }

  return Array.from(found).sort(sortTeeth);
}

function expandDentalRange(start, end) {
  const upper = [
    "18", "17", "16", "15", "14", "13", "12", "11",
    "21", "22", "23", "24", "25", "26", "27", "28"
  ];

  const lower = [
    "48", "47", "46", "45", "44", "43", "42", "41",
    "31", "32", "33", "34", "35", "36", "37", "38"
  ];

  const upperPrimary = [
    "55", "54", "53", "52", "51",
    "61", "62", "63", "64", "65"
  ];

  const lowerPrimary = [
    "85", "84", "83", "82", "81",
    "71", "72", "73", "74", "75"
  ];

  const orders = [upper, lower, upperPrimary, lowerPrimary];

  for (const order of orders) {
    const s = order.indexOf(start);
    const e = order.indexOf(end);

    if (s !== -1 && e !== -1) {
      const from = Math.min(s, e);
      const to = Math.max(s, e);
      return order.slice(from, to + 1);
    }
  }

  return [start, end];
}

function getSettlementCategory(cadType, teeth) {
  if (cadType === "bridge_cad") {
    return "브릿지";
  }

  if (cadType === "inlay_cad") {
    return "인레이";
  }

  if (cadType === "crown_cad" || cadType === "waxup_cad" || cadType === "abutment_cad") {
    if (teeth.length === 0) {
      return "치식미확인";
    }

    const hasAnterior = teeth.some(t => ANTERIOR.has(t));
    const hasPosterior = teeth.some(t => POSTERIOR.has(t));

    if (hasAnterior && hasPosterior) {
      return "전치부+구치부 혼합";
    }

    if (hasAnterior) {
      return "전치부";
    }

    if (hasPosterior) {
      return "구치부";
    }
  }

  return "기타";
}

function getAreaLabel(teeth) {
  if (teeth.length === 0) {
    return "미확인";
  }

  const areas = Array.from(new Set(teeth.map(t => getSingleToothArea(t))));
  return areas.join(", ");
}

function getSingleToothArea(tooth) {
  if (ANTERIOR.has(tooth)) {
    return "전치부";
  }

  if (POSTERIOR.has(tooth)) {
    return "구치부";
  }

  return "기타";
}

function addSummary(summary, category, fileCount, unitCount) {
  if (!summary[category]) {
    summary[category] = {
      fileCount: 0,
      unitCount: 0
    };
  }

  summary[category].fileCount += fileCount;
  summary[category].unitCount += unitCount;
}

function writeSummarySheet(ss, summary) {
  const sheet = resetSheet(ss, "정산요약");

  const rows = [
    ["정산분류", "파일 수", "치아/유닛 수"]
  ];

  Object.keys(summary).sort().forEach(category => {
    rows.push([
      category,
      summary[category].fileCount,
      summary[category].unitCount
    ]);
  });

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  formatSheet(sheet, rows[0].length);
}

function writeToothSummarySheet(ss, toothSummary) {
  const sheet = resetSheet(ss, "치식별상세");

  const rows = [
    ["정산분류", "치식", "부위", "수량"]
  ];

  Object.keys(toothSummary).sort().forEach(key => {
    const [category, tooth, area] = key.split("__");

    rows.push([
      category,
      tooth,
      area,
      toothSummary[key]
    ]);
  });

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  formatSheet(sheet, rows[0].length);
}

function writeFileListSheet(ss, fileRows) {
  const sheet = resetSheet(ss, "파일목록");

  const header = [
    "폴더",
    "경로",
    "파일명",
    "CAD 타입",
    "추출 치식",
    "정산분류",
    "부위",
    "치아/유닛 수",
    "파일 링크"
  ];

  const rows = [header].concat(fileRows);

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  formatSheet(sheet, rows[0].length);
}

function resetSheet(ss, name) {
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
  } else {
    sheet.clear();
  }

  return sheet;
}

function formatSheet(sheet, columnCount) {
  sheet.setFrozenRows(1);

  const headerRange = sheet.getRange(1, 1, 1, columnCount);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#eeeeee");

  sheet.autoResizeColumns(1, columnCount);
}

function extractFolderId(url) {
  const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);

  if (!match) {
    throw new Error("폴더 ID를 찾을 수 없습니다: " + url);
  }

  return match[1];
}

function sortTeeth(a, b) {
  const order = [
    "18", "17", "16", "15", "14", "13", "12", "11",
    "21", "22", "23", "24", "25", "26", "27", "28",
    "48", "47", "46", "45", "44", "43", "42", "41",
    "31", "32", "33", "34", "35", "36", "37", "38",
    "55", "54", "53", "52", "51",
    "61", "62", "63", "64", "65",
    "85", "84", "83", "82", "81",
    "71", "72", "73", "74", "75"
  ];

  return order.indexOf(a) - order.indexOf(b);
}
