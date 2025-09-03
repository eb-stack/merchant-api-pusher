import "dotenv/config";
import fetch from "node-fetch";

const SHOP = process.env.SHOPIFY_SHOP!;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN!;
const MAX_PRODUCTS = parseInt(process.env.MAX_PRODUCTS || "10", 10);

// Stable Admin API version
const API_VERSION = "2024-10";

if (!SHOP || !TOKEN) {
  throw new Error("Missing SHOPIFY_SHOP or SHOPIFY_ADMIN_TOKEN in .env");
}

type VariantNode = {
  id: string;
  legacyResourceId: string;
  sku: string | null;
  barcode: string | null;
  inventoryQuantity: number | null;
  price: string; // <-- scalar string (e.g., "15.99")
  image?: { url: string | null } | null;
};

type ProductNode = {
  id: string;
  title: string;
  handle: string;
  bodyHtml: string | null;
  images: { nodes: { url: string }[] };
  variants: { nodes: VariantNode[] };
};

export type NormalizedVariant = {
  productTitle: string;
  descriptionHtml: string;
  handle: string;
  productImage?: string;
  variant: {
    id: string;
    legacyId: string;
    sku: string | null;
    barcode: string | null;
    price: string;          // string like "15.99"
    currencyCode: string;   // from shop.currencyCode
    inventoryQuantity: number;
    image?: string | null;
  };
};

const PRODUCTS_QUERY = `
  query Products($first: Int!, $after: String) {
    products(first: $first, after: $after, query: "status:active") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        bodyHtml
        images(first: 1) { nodes { url } }
        variants(first: 100) {
          nodes {
            id
            legacyResourceId
            sku
            barcode
            inventoryQuantity
            price         # <-- scalar
            image { url }
          }
        }
      }
    }
  }
`;

const SHOP_QUERY = `
  query ShopCurrency { shop { currencyCode } }
`;

type GraphQLResp<T> = { data?: T; errors?: any[] };

async function gql<T>(query: string, variables?: any): Promise<GraphQLResp<T>> {
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify GraphQL HTTP ${res.status} ${res.statusText}: ${text.slice(0, 600)}`);
  }
  return (await res.json()) as any;
}

async function getShopCurrency(): Promise<string> {
  const json = await gql<{ shop: { currencyCode: string } }>(SHOP_QUERY);
  if (json.errors?.length) {
    throw new Error(`Shopify GraphQL errors (shop): ${JSON.stringify(json.errors, null, 2)}`);
  }
  const code = json.data?.shop?.currencyCode;
  if (!code) throw new Error(`Could not read shop.currencyCode from Shopify response: ${JSON.stringify(json)}`);
  return code;
}

export async function fetchActiveProducts(limit = MAX_PRODUCTS): Promise<NormalizedVariant[]> {
  const out: NormalizedVariant[] = [];
  let after: string | null = null;

  // fetch currency once
  const shopCurrency = await getShopCurrency();

  while (out.length < limit) {
    const json = await gql<{ products: { pageInfo: { hasNextPage: boolean; endCursor?: string | null }; nodes: ProductNode[] } }>(
      PRODUCTS_QUERY,
      { first: Math.min(50, limit - out.length), after }
    );

    if (json.errors && json.errors.length) {
      // Typical causes: missing scopes (read_products/read_inventory) or bad token
      throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors, null, 2)}`);
    }

    const page = json.data?.products;
    if (!page) {
      throw new Error(`Unexpected Shopify response (no 'products'): ${JSON.stringify(json)}`);
    }

    const products = page.nodes || [];
    for (const p of products) {
      const productImage = p.images?.nodes?.[0]?.url;
      for (const v of p.variants.nodes) {
        out.push({
          productTitle: p.title,
          descriptionHtml: p.bodyHtml || "",
          handle: p.handle,
          productImage,
          variant: {
            id: v.id,
            legacyId: String(v.legacyResourceId),
            sku: v.sku,
            barcode: v.barcode,
            price: v.price,                 // scalar string
            currencyCode: shopCurrency,     // from shop query
            inventoryQuantity: v.inventoryQuantity ?? 0,
            image: v.image?.url ?? null,
          },
        });
        if (out.length >= limit) break;
      }
      if (out.length >= limit) break;
    }

    if (page.pageInfo.hasNextPage && page.pageInfo.endCursor) {
      after = page.pageInfo.endCursor;
    } else {
      break;
    }
  }

  return out;
}

