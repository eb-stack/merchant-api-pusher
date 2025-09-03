import "dotenv/config";
import { getProductByOfferId } from "./google";

async function main() {
  const offerId = process.argv.slice(2)[0];
  if (!offerId) {
    console.error("Usage: npm run status -- <offerId>");
    process.exit(1);
  }

  const p = await getProductByOfferId(offerId);
  if (!p) {
    console.log("No processed product found yet. It may still be processing. Try again in a few minutes.");
    process.exit(0);
  }

  console.log(JSON.stringify({
    name: p.name,
    offerId: p.offerId,
    contentLanguage: p.contentLanguage,
    feedLabel: p.feedLabel,
    channel: p.channel,
    productStatus: p.productStatus,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
