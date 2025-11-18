import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    console.log("Webhook received");

    // Read raw body
    const rawBody = Buffer.from(await req.arrayBuffer());
    console.log("Raw body:", rawBody.toString("utf8"));

    // Verify Shopify HMAC
    const hmac = req.headers.get("x-shopify-hmac-sha256") || "";
    console.log("Received HMAC:", hmac);

    const hash = crypto
      .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET!)
      .update(rawBody)
      .digest("base64");

    console.log("Calculated HMAC:", hash);

    if (hash !== hmac) {
      console.warn("HMAC verification failed");
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    console.log("HMAC verification passed");

    const order = JSON.parse(rawBody.toString("utf8"));
    const orderId = order.id;
    console.log("Order ID:", orderId);

    const hardcodedImage =
      "https://imagedelivery.net/lEHX3YUcvfDIImhkEJ2s3Q/generated-0b55469101668a1c0a543df650cec0a57e582c256a3acf6f9513c6cce104b05c-v1/public";

    const itemImages = order.line_items.map((item: any, index: number) => ({
      item_number: index + 1,
      product: {
        title: item.title,
        variant: item.variant_title || "Default",
      },
      image_url: hardcodedImage,
    }));

    console.log("Prepared itemImages:", itemImages);

    // For json type, use the object directly (not stringified)
    const metafieldValue = itemImages;

    console.log("Value for metafield:", JSON.stringify(metafieldValue));

    const metafieldUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-10/orders/${orderId}/metafields.json`;

    // Check if metafield exists
    const checkResponse = await fetch(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-10/orders/${orderId}/metafields.json?namespace=custom&key=product_images`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!,
        },
      }
    );

    const existing = await checkResponse.json();
    console.log("Existing metafields:", existing);

    if (existing.metafields && existing.metafields.length > 0) {
      // Update existing metafield
      const mfId = existing.metafields[0].id;
      const updateUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/metafields/${mfId}.json`;
      console.log("Updating existing metafield:", mfId);

      const updateResponse = await fetch(updateUrl, {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metafield: {
            value: metafieldValue,
            type: "json",
          },
        }),
      });

      const updateData = await updateResponse.json();
      console.log("Update response:", updateData);

      return NextResponse.json({
        message: "Metafield updated successfully",
        order_id: orderId,
        saved: itemImages,
      });
    } else {
      // Create new metafield
      console.log("Creating new metafield");

      const createResponse = await fetch(metafieldUrl, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metafield: {
            namespace: "custom",
            key: "product_images",
            type: "json",
            value: metafieldValue,
          },
        }),
      });

      const createData = await createResponse.json();
      console.log("Create response status:", createResponse.status);
      console.log("Create response:", JSON.stringify(createData, null, 2));

      return NextResponse.json({
        message: "Metafield created successfully",
        order_id: orderId,
        saved: itemImages,
      });
    }
  } catch (err) {
    console.error("Error in webhook:", err);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}