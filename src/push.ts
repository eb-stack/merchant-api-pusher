import "dotenv/config";
import { fetchActiveProducts } from "./shopify";
import { mapShopifyToMerchantAttributes } from "./map";
import { createPrimaryDataSourceIfMissing, insertProductInput, CONTENT_LANGUAGE, FEED_LABEL } from "./google";

const STORE_DOMAIN = process.env.STORE_DOMAIN!;
const MAX_PRODUCTS = parseInt(process.env.MAX_PRODUCTS || "10", 10);

if (!STORE_DOMAIN) {
  throw new Error("Missing STORE_DOMAIN in .env");
}

async function main() {
  console.log("Ensuring Primary API Data Source exists...");
  const dsName = await createPrimaryDataSourceIfMissing("Primary API Source");
  console.log(`Data Source: ${dsName}`);

  console.log(`Fetching up to ${MAX_PRODUCTS} active Shopify products...`);
  const variants = await fetchActiveProducts(MAX_PRODUCTS);

  console.log(`Pushing variant-level offers via Merchant API...`);
  for (const v of variants) {
    const { offerId, attributes, link } = mapShopifyToMerchantAttributes({
      productTitle: v.productTitle,
      descriptionHtml: v.descriptionHtml,
      handle: v.handle,
      productImage: v.productImage,
      variant: v.variant,
      storeDomain: STORE_DOMAIN,
    });

    try {
      const productName = await insertProductInput({
        dataSource: dsName,
        offerId,
        contentLanguage: CONTENT_LANGUAGE,
        feedLabel: FEED_LABEL,
        productAttributes: attributes,
      });

      console.log(`OK: offerId=${offerId} link=${link} ${productName ? `product=${productName}` : ""}`);
    } catch (e: any) {
      console.error(`FAIL: offerId=${offerId} reason=${e.message || e}`);
    }
  }

  console.log("Done. NOTE: processed products may take a few minutes to appear in Products list.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
