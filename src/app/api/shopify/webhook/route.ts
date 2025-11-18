import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs"; // VERY IMPORTANT

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
    console.log("Parsed order:", order);

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

    // Send metafield to Shopify
    const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-10/orders/${orderId}/metafields.json`;
    console.log("Shopify URL:", url);

    const response = await fetch(url, {
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
          value: JSON.stringify(itemImages, null, 2),
        },
      }),
    });

    console.log("Shopify response status:", response.status);
    const data = await response.json();
    console.log("Shopify response body:", data);

    if (!response.ok) {
      console.error("Failed to add metafield");
      return NextResponse.json(
        { message: "Failed", error: data },
        { status: response.status }
      );
    }

    console.log("Metafield saved successfully");

    return NextResponse.json({
      message: "Metafield saved successfully",
      order_id: orderId,
      saved: itemImages,
    });
  } catch (err) {
    console.error("Error in webhook:", err);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
