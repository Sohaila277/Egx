const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const cheerio = require("cheerio");

async function run() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("https://www.egx.com.eg/ar/SpecializedActivities.aspx", { waitUntil: "networkidle2" });
  
  const content = await page.content();
  const $ = cheerio.load(content);
  
  $("[id^='Cat']").each((i, el) => {
     const activityName = $(el).text().trim().substring(0, 50);
     
     // try different selectors
     let table = $(el).closest('.accordion-item').find('table');
     if (table.length === 0) {
        table = $(el).parent().parent().next().find("table");
     }
     if (table.length === 0) {
        table = $(el).next("div").find("table");
     }
     
     const isinRows = table.find("span[id*='lblISIN']").length;
     console.log(`Cat: ${activityName} - isinRows: ${isinRows}`);
     if (isinRows === 0 && table.length > 0) {
        console.log(`  Table HTML:`, table.html()?.substring(0, 300));
     }
  });

  await browser.close();
}
run();
