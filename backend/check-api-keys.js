require("cross-fetch/polyfill");
const { ConvexClient } = require("convex/browser");

async function checkAPIKeys() {
  console.log("=== Checking API Keys in Convex ===");
  
  const client = new ConvexClient("https://good-dolphin-454.convex.cloud");
  
  try {
    // Use the internal API to query settings
    const { api } = require("./dist/lib/convex-api");
    const settings = await client.query(api.applicationSettings.getAll);
    
    console.log("\nApplication Settings:");
    settings.forEach(setting => {
      console.log(`- ${setting.key}: ${setting.value ? `Set (${setting.value.length} chars)` : 'NOT SET'}`);
    });
    
  } catch (error) {
    console.log("Error:", error.message);
  }
}

checkAPIKeys();