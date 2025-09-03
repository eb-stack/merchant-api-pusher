import "dotenv/config";
import fetch from "node-fetch";
import { JWT } from "google-auth-library";
import fs from "fs";

async function main() {
  const MERCHANT_ID = process.env.MERCHANT_ID;
  const DEV_EMAIL = process.env.DEVELOPER_EMAIL;
  const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./gsa-key.json";
  if (!MERCHANT_ID) throw new Error("MERCHANT_ID missing from .env");
  if (!DEV_EMAIL) throw new Error("DEVELOPER_EMAIL missing from .env");
  if (!fs.existsSync(KEY_PATH)) throw new Error(`Key file not found at ${KEY_PATH}`);

  const key = JSON.parse(fs.readFileSync(KEY_PATH, "utf8"));
  if (key.type !== "service_account" || !key.private_key || !key.client_email) {
    throw new Error("gsa-key.json is not a valid service-account key (missing private_key or wrong type)");
  }

  // Build a JWT client directly from the key and force a token
  const client = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ["https://www.googleapis.com/auth/content"],
  });
  const { access_token } = await client.authorize();
  if (!access_token) throw new Error("Failed to obtain access token from service account key");

  console.log("Has Authorization header:", true);

  const url = `https://merchantapi.googleapis.com/accounts/v1/accounts/${MERCHANT_ID}/developerRegistration:registerGcp`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ developerEmail: DEV_EMAIL }),
  });

  const text = await resp.text();
  console.log("HTTP", resp.status, resp.statusText);
  console.log(text);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

