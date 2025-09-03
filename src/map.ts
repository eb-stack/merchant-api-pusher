import { stripHtml, toMicros, pickImage, isValidGtin } from "./utils";

export type MerchantAttributes = {
  title: string;
  description: string;
  link: string;
  imageLink?: string;
  availability: "IN_STOCK" | "OUT_OF_STOCK";
  condition: "NEW";
  price: { amountMicros: string; currencyCode: string };
  gtins?: string[];
};

type Inputs = {
  productTitle: string;
  descriptionHtml: string;
  handle: string;
  productImage?: string;
  variant: {
    legacyId: string;
    sku: string | null;
    barcode: string | null;
    price: string;
    currencyCode: string;
    inventoryQuantity: number;
    image?: string | null;
  };
  storeDomain: string;
};

export function mapShopifyToMerchantAttributes(x: Inputs): {
  offerId: string;
  attributes: MerchantAttributes;
  link: string;
} {
  const offerId = (x.variant.sku && x.variant.sku.trim()) || x.variant.legacyId;
  const link = `${x.storeDomain.replace(/\/+$/, "")}/products/${x.handle}?variant=${x.variant.legacyId}`;

  const description = stripHtml(x.descriptionHtml);
  const imageLink = pickImage(x.variant.image || undefined, x.productImage || undefined);
  const availability = x.variant.inventoryQuantity > 0 ? "IN_STOCK" : "OUT_OF_STOCK";

  const attrs: MerchantAttributes = {
    title: x.productTitle,
    description,
    link,
    imageLink,
    availability,
    condition: "NEW",
    price: {
      amountMicros: toMicros(x.variant.price),
      currencyCode: x.variant.currencyCode,
    },
  };

  if (isValidGtin(x.variant.barcode)) {
    attrs.gtins = [x.variant.barcode!.replace(/\D/g, "")];
  }

  return { offerId, attributes: attrs, link };
}
