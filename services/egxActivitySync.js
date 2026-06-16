const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const path = require("path");

const DATA_DIR = path.join(
  __dirname,
  "..",
  "data"
);

const ACTIVITIES_FILE = path.join(
  DATA_DIR,
  "activities.json"
);

const HISTORY_FILE = path.join(
  DATA_DIR,
  "activityHistory.json"
);

const COMPANIES_FILE = path.join(
  DATA_DIR,
  "companies.json"
);

function loadActivities() {
  if (fs.existsSync(ACTIVITIES_FILE)) {
    return fs.readJsonSync(ACTIVITIES_FILE);
  }
  return [];
}

function saveActivities(data) {
  fs.writeJsonSync(ACTIVITIES_FILE, data, {
    spaces: 2,
  });
}

function loadHistory() {
  if (fs.existsSync(HISTORY_FILE)) {
    return fs.readJsonSync(HISTORY_FILE);
  }
  return [];
}

function saveHistory(data) {
  fs.writeJsonSync(HISTORY_FILE, data, {
    spaces: 2,
  });
}

async function syncActivities() {
  try {
    console.log("Fetching EGX activities...");

    const puppeteer = require("puppeteer-extra");
    const StealthPlugin = require("puppeteer-extra-plugin-stealth");
    puppeteer.use(StealthPlugin());

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    });
    const page = await browser.newPage();
    await page.goto("https://www.egx.com.eg/ar/SpecializedActivities.aspx", {
      waitUntil: "networkidle2",
      timeout: 60000
    });
    
    // Wait for at least one category to load
    await page.waitForSelector("div[id^='Cat']", { timeout: 30000 });
    
    const html = await page.content();
    await browser.close();

    const $ = cheerio.load(html);

    console.log(
      "Cat div count:",
      $("div[id^='Cat']").length
    );

    console.log(
      "Table count:",
      $("table").length
    );

    console.log(
      "Span count:",
      $("span").length
    );

    console.log(
      "Body preview:"
    );

    console.log(
      $("body")
        .text()
        .replace(/\s+/g, " ")
        .substring(0, 1000)
    );

    const existingActivities =
      loadActivities();

    const history =
      loadHistory();
      
    let companies = [];
    if (fs.existsSync(COMPANIES_FILE)) {
      companies = fs.readJsonSync(COMPANIES_FILE);
    }

    const newActivities = [];

    $("div[id^='Cat']").each((i, el) => {

      const activityName =
        $(el).text().trim();

      console.log(
        `Found category: ${activityName}`
      );

      let table = $(el).closest('.accordion-item').find('table');
      if (table.length === 0) {
        table = $(el).parent().parent().next().find("table");
      }
      if (table.length === 0) {
        table = $(el).next("div").find("table");
      }

      table
        .find("tr")
        .each((j, row) => {
          const isinSpan = $(row).find("span[id*='lblISIN']");
          let symbolId = "";
          
          if (isinSpan.length > 0) {
            symbolId = isinSpan.text().trim();
          } else {
            // Fallback for tables without lblISIN (like CatSS)
            const tdName = $(row).find("td:nth-child(3)").text().trim();
            if (!tdName || tdName.includes("الاسم")) return; // skip headers or empty
            
            // Try to match with companies.json by name
            const matchedCompany = companies.find(c => c.CompanyName && c.CompanyName.trim() === tdName);
            if (matchedCompany) {
              symbolId = matchedCompany.Symbolid;
            } else {
              symbolId = tdName; // Fallback to raw Arabic Name
            }
          }
          
          if (!symbolId) return;

          const oldActivity =
            existingActivities.find(
              (a) =>
                a.Symbolid === symbolId
            );

          if (
            oldActivity &&
            oldActivity.Activity !==
              activityName
          ) {
            
            // TODO: [DATABASE_INTEGRATION] 
            // Here is where you will INSERT the old activity into your real database's History table
            // e.g. db.query('INSERT INTO activity_history (Symbolid, OldActivity, NewActivity, ChangedAt) VALUES (...)', [symbolId, oldActivity.Activity, activityName, new Date()])
            
            history.push({
              Symbolid: symbolId,
              OldActivity:
                oldActivity.Activity,
              NewActivity:
                activityName,
              ChangedAt:
                new Date().toISOString(),
            });
          }

          newActivities.push({
            Symbolid: symbolId,
            Activity:
              activityName,
            UpdatedAt:
              new Date().toISOString(),
          });
        });
    });

    // Merge newActivities into existingActivities (UPSERT)
    const finalActivities = [...existingActivities];
    newActivities.forEach((newAct) => {
      const idx = finalActivities.findIndex((a) => a.Symbolid === newAct.Symbolid);
      if (idx !== -1) {
        finalActivities[idx] = newAct;
      } else {
        finalActivities.push(newAct);
      }
    });

    // TODO: [DATABASE_INTEGRATION]
    // Here is where you will update the main companies table or activities table in your real database.
    // e.g., you can iterate over `newActivities` and run UPDATE queries, or do a bulk upsert.
    saveActivities(finalActivities);
    
    // TODO: [DATABASE_INTEGRATION]
    // Alternatively, if you batched your history inserts above, you can execute the bulk insert here.
    saveHistory(history);

    console.log(
      `Updated ${newActivities.length} activity records`
    );

    return {
      totalActivities:
        newActivities.length,
    };

  } catch (error) {
    console.error(error);
    throw error;
  }
}

module.exports = {
  syncActivities,
};