import dotenv from "dotenv";
dotenv.config();

import { syncAllCampaigns } from "./services/campaignSyncService";
import logger from "./utils/logger";

async function main() {
  logger.info(
    `Starting campaign sync application in ${
      process.env.NODE_ENV || "development"
    } mode...`
  );

  try {
    await syncAllCampaigns();
    logger.info("Sync completed successfully!");
  } catch (error) {
    logger.error("Sync failed", { error });
    process.exit(1);
  }
}

main();
