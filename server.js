const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs-extra");
const path = require("path");
const cors = require("cors");
const cron = require("node-cron");

const app = express();
const {
  syncActivities,
} = require("./services/egxActivitySync");

app.use(cors());
app.use(express.json());

const PORT = 5000;

// ====================
// Data Files
// ====================

const DATA_DIR = path.join(__dirname, "data");

const UPLOADS_FILE = path.join(DATA_DIR, "uploads.json");
const SNAPSHOTS_FILE = path.join(DATA_DIR, "companySnapshots.json");
const COMPANIES_FILE = path.join(DATA_DIR, "companies.json");

fs.ensureDirSync(DATA_DIR);

if (!fs.existsSync(UPLOADS_FILE)) {
  fs.writeJsonSync(UPLOADS_FILE, []);
}

if (!fs.existsSync(SNAPSHOTS_FILE)) {
  fs.writeJsonSync(SNAPSHOTS_FILE, []);
}

if (!fs.existsSync(COMPANIES_FILE)) {
  fs.writeJsonSync(COMPANIES_FILE, []);
}

// ====================
// Multer
// ====================

const upload = multer({
  dest: "uploads/",
});

// ====================
// Helpers
// ====================

function loadUploads() {
  return fs.readJsonSync(UPLOADS_FILE);
}

function saveUploads(data) {
  fs.writeJsonSync(UPLOADS_FILE, data, {
    spaces: 2,
  });
}

function loadSnapshots() {
  return fs.readJsonSync(SNAPSHOTS_FILE);
}

function saveSnapshots(data) {
  fs.writeJsonSync(SNAPSHOTS_FILE, data, {
    spaces: 2,
  });
}

function loadCompanies() {
  return fs.readJsonSync(COMPANIES_FILE);
}

function saveCompanies(data) {
  fs.writeJsonSync(COMPANIES_FILE, data, {
    spaces: 2,
  });
}

// ====================
// Upload Excel
// ====================

app.post("/upload-excel", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const workbook = XLSX.readFile(req.file.path);

    const firstSheet = workbook.SheetNames[0];

    const rows = XLSX.utils.sheet_to_json(
      workbook.Sheets[firstSheet],
      {
        defval: null,
      }
    );

    const uploadId = Date.now().toString();

    const uploadInfo = {
      uploadId,
      uploadedAt: new Date().toISOString(),
      fileName: req.file.originalname,
      totalRows: rows.length,
    };

    // Save upload info

    const uploads = loadUploads();
    
    // Check if already uploaded today
    const today = new Date().toISOString().split('T')[0];
    const alreadyUploadedToday = uploads.some(u => u.uploadedAt.startsWith(today));
    
    if (alreadyUploadedToday) {
      return res.status(400).json({
        success: false,
        message: "لقد قمت برفع ملف اليوم بالفعل. لا يمكنك رفع أكثر من ملف في اليوم الواحد.",
      });
    }

    uploads.push(uploadInfo);

    saveUploads(uploads);

    // Load existing data

    const snapshots = loadSnapshots();
    const companies = loadCompanies();

    // Load current activities to embed in the snapshot
    let activities = [];
    try {
      activities = fs.readJsonSync(path.join(DATA_DIR, "activities.json"));
    } catch (e) {
      // Ignore if activities file doesn't exist yet
    }

    rows.forEach((row) => {
      const symbolId = row["Symbolid"]?.toString().trim() || row["SymbolId"]?.toString().trim() || null;

      const companyName =
        row[" الاسم"]?.toString().trim() || row["Name"]?.toString().trim() || null;

      // Add company only once

      if (
        symbolId &&
        !companies.some(
          (c) => c.Symbolid === symbolId
        )
      ) {
        companies.push({
          Symbolid: symbolId,
          CompanyName: companyName,
          createdAt: new Date().toISOString(),
        });
      }

      // Find current specialized activity for this symbol
      const currentActivityObj = activities.find(a => a.Symbolid === symbolId);
      const currentActivity = currentActivityObj ? currentActivityObj.Activity : null;

      // Save snapshot

      snapshots.push({
        uploadId,
        uploadedAt: uploadInfo.uploadedAt,
        
        التاريخ: new Date().toISOString().split('T')[0],

        Symbolid: symbolId,

        الاسم: companyName,
        
        النشاط_المتخصص: currentActivity,

        اخر: row[" اخر"] || row["Last"] || null,

        كمية_اخر: row[" كمية اخر"] || row["Vol"] || null,

        نسبة_التغير: row[" %التغير"] || row["%Chng"] || null,

        اعلي_سعر: row["اعلي سعر"] || row["High Price"] || null,

        اقل_سعر: row["اقل سعر"] || row["Low Price"] || null,

        الطلبات: row[" الطلبات"] || row["Bids Volume"] || null,

        سعر_الطلب: row[" سعر الطلب"] || row["Bidprice"] || null,

        سعر_العرض: row[" سعر العرض"] || row["Askprice"] || null,

        العروض: row[" العروض"] || row["Asks Volume"] || null,

        كمية_التداول: row[" كمية التداول"] || row["Volume"] || null,

        القيمة: row["القيمة"] || row["Value"] || null,

        اغلاق_سابق: row[" إغلاق سابق"] || row["open"] || null,

        اغلاق: row[" إغلاق"] || row["Close"] || null,
      });
    });

    // TODO: [DATABASE_INTEGRATION]
    // Here is where you will update or insert into your real database's 'Companies' table.
    // e.g. db.query('INSERT IGNORE INTO companies ...')
    saveCompanies(companies);

    // TODO: [DATABASE_INTEGRATION]
    // Here is where you will insert the daily snapshots (which now include prices AND the specialized activity) into your real database's 'Daily_Snapshots' or 'Prices' table.
    // e.g. db.query('INSERT INTO daily_snapshots (Symbolid, Activity, Price, Date) VALUES ...')
    saveSnapshots(snapshots);

    res.json({
      success: true,
      uploadId,
      uploadedRows: rows.length,
      totalCompanies: companies.length,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ====================
// Latest Upload
// ====================

app.get("/latest", (req, res) => {
  try {
    const uploads = loadUploads();

    if (uploads.length === 0) {
      return res.json([]);
    }

    const latestUpload =
      uploads[uploads.length - 1];

    const snapshots = loadSnapshots();

    const latestData = snapshots.filter(
      (x) => x.uploadId === latestUpload.uploadId
    );

    res.json(latestData);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// ====================
// Company History
// ====================

app.get("/company/:symbol/history", (req, res) => {
  try {
    const symbol = req.params.symbol;

    const snapshots = loadSnapshots();

    const history = snapshots.filter(
      (x) => x.Symbolid === symbol
    );

    res.json(history);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// ====================
// All Uploads
// ====================

app.get("/uploads", (req, res) => {
  res.json(loadUploads());
});

// ====================
// All Companies
// ====================

app.get("/companies", (req, res) => {
  res.json(loadCompanies());
});

// ====================
// Statistics
// ====================

app.get("/stats", (req, res) => {
  const uploads = loadUploads();
  const snapshots = loadSnapshots();
  const companies = loadCompanies();

  res.json({
    totalUploads: uploads.length,
    totalCompanies: companies.length,
    totalSnapshots: snapshots.length,
  });
});

app.get("/sync-activities", async (req, res) => {
  try {

    const result =
      await syncActivities();

    res.json({
      success: true,
      ...result,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/activities", (req, res) => {

  const activitiesFile = path.join(
    DATA_DIR,
    "activities.json"
  );

  const activities = fs.readJsonSync(activitiesFile);
  const companies = loadCompanies();

  // Match each activity with the corresponding company name
  const activitiesWithNames = activities.map((activity) => {
    const company = companies.find(c => c.Symbolid === activity.Symbolid);
    return {
      Symbolid: activity.Symbolid,
      CompanyName: company ? company.CompanyName : "Unknown",
      Activity: activity.Activity,
      UpdatedAt: activity.UpdatedAt
    };
  });

  res.json(activitiesWithNames);
});

app.get("/activity-history", (req, res) => {

  const file = path.join(
    DATA_DIR,
    "activityHistory.json"
  );

  res.json(
    fs.readJsonSync(file)
  );
});

// ====================
// Daily Cron Job
// ====================

// Run every day at 03:00 PM
cron.schedule("0 15 * * *", async () => {
  console.log("Running daily scheduled task: syncActivities");
  try {
    const result = await syncActivities();
    console.log("Daily sync completed:", result);
  } catch (err) {
    console.error("Daily sync failed:", err);
  }
});

// ====================
// Start
// ====================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});