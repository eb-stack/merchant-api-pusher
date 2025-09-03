import "dotenv/config";
import fs from "fs";
import fetch from "node-fetch";
import { JWT } from "google-auth-library";
import { DataSourcesServiceClient } from "@google-shopping/datasources";
import { ProductsServiceClient } from "@google-shopping/products";

/**
 * Env
 */
const MERCHANT_ID = process.env.MERCHANT_ID!;
const FEED_LABEL = process.env.FEED_LABEL || "US";
const CONTENT_LANGUAGE = process.env.CONTENT_LANGUAGE || "en";
const FEED_COUNTRIES = (process.env.FEED_COUNTRIES || "US")
  .split(",")
  .map((s) => s.trim().toUpperCase());
const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./gsa-key.json";
const DEBUG = (process.env.DEBUG || "").toLowerCase() === "1";

if (!MERCHANT_ID) throw new Error("Missing MERCHANT_ID in .env");
if (!fs.existsSync(KEY_PATH)) throw new Error(`Key file not found at ${KEY_PATH}`);

/**
 * gRPC clients (fine for listing/creating data sources and reading product status)
 */
const parentAccount = `accounts/${MERCHANT_ID}`;
const datasourcesClient = new DataSourcesServiceClient();
const productsClient = new ProductsServiceClient();

/**
 * Auth (service account JWT → access token)
 */
async function getAccessToken(): Promise<string> {
  const key = JSON.parse(fs.readFileSync(KEY_PATH, "utf8"));
  if (key.type !== "service_account" || !key.private_key || !key.client_email) {
    throw new Error("gsa-key.json is not a valid service-account key (missing private_key/client_email)");
  }
  const client = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ["https://www.googleapis.com/auth/content"],
  });

  const tokens = await client.authorize().catch(() => ({ access_token: undefined as string | undefined }));
  if (tokens?.access_token) return tokens.access_token;

  const fallback = await client.getAccessToken();
  if (!fallback) throw new Error("Could not obtain Google access token");
  return fallback as unknown as string;
}

/**
 * Create (or reuse) a Primary API data source for the current contentLanguage/feedLabel
 * Returns: accounts/{MERCHANT_ID}/dataSources/{ID}
 */
export async function createPrimaryDataSourceIfMissing(displayName: string): Promise<string> {
  const [listResp] = await datasourcesClient.listDataSources({ parent: parentAccount });
  const existing = (listResp?.dataSources || []).find((ds: any) => {
    const p = ds.primaryProductDataSource;
    return p && p.contentLanguage === CONTENT_LANGUAGE && p.feedLabel === FEED_LABEL;
  });
  if (existing?.name) {
    if (DEBUG) console.log("DEBUG existing dataSource:", existing.name);
    return existing.name as string;
  }

  const req = {
    parent: parentAccount,
    dataSource: {
      displayName,
      primaryProductDataSource: {
        contentLanguage: CONTENT_LANGUAGE,
        feedLabel: FEED_LABEL,
        countries: FEED_COUNTRIES,
      },
    },
  };

  const [createResp] = await datasourcesClient.createDataSource(req as any);
  if (!createResp?.name) throw new Error("Failed to create data source; no name returned");
  if (DEBUG) console.log("DEBUG created dataSource:", createResp.name);
  return createResp.name as string;
}

/**
 * Insert product inputs (variant-level) using the Merchant API REST endpoint.
 * IMPORTANT: Per Google’s reference, dataSource goes in the **query string**,
 * and the **body is the ProductInput** (no wrapper).
 * Docs: accounts.productInputs.insert — dataSource is a required query param. :contentReference[oaicite:0]{index=0}
 */
type InsertArgs = {
  dataSource: string;               // accounts/{acct}/dataSources/{id}
  offerId: string;
  contentLanguage: string;
  feedLabel: string;
  productAttributes: any;
};

export async function insertProductInput(args: InsertArgs): Promise<string | undefined> {
  if (!args.dataSource) throw new Error("insertProductInput: missing dataSource");

  const token = await getAccessToken();

  // The ProductInput body (NO dataSource here)
  const productInputBody = {
    offerId: args.offerId,
    contentLanguage: args.contentLanguage,
    feedLabel: args.feedLabel,
    productAttributes: args.productAttributes,
  };

  // Try v1 first, then v1beta
  for (const ver of ["v1", "v1beta"]) {
    const url =
      `https://merchantapi.googleapis.com/products/${ver}/` +
      `accounts/${MERCHANT_ID}/productInputs:insert?` +
      `dataSource=${encodeURIComponent(args.dataSource)}`;

    if (DEBUG) {
      console.log("DEBUG insert URL:", url);
      console.log("DEBUG insert body:", JSON.stringify(productInputBody, null, 2));
    }

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(productInputBody),
    });

    const text = await resp.text();
    if (resp.ok) {
      try {
        const json = text ? JSON.parse(text) : {};
        // On success Google returns the inserted ProductInput; sometimes it also includes product name
        // We return undefined if product name is not yet available (processing is async).
        return json.product as string | undefined;
      } catch {
        return undefined;
      }
    }

    // If v1beta missing (404), loop will try the other version; otherwise, fail fast with real details.
    if (!(ver === "v1beta" && resp.status === 404)) {
      throw new Error(`Insert failed (${ver}): HTTP ${resp.status} ${resp.statusText} ${text.slice(0, 600)}`);
    }
  }

  throw new Error("Insert failed on both v1 and v1beta.");
}

/**
 * Get a processed product by offerId (for status CLI)
 */
export async function getProductByOfferId(offerId: string): Promise<any | undefined> {
  const it = productsClient.listProductsAsync({ parent: parentAccount });
  for await (const p of it as any) {
    if (p.offerId === offerId && p.contentLanguage === CONTENT_LANGUAGE && p.feedLabel === FEED_LABEL) {
      return p;
    }
  }
  return undefined;
}

export { CONTENT_LANGUAGE, FEED_LABEL };


