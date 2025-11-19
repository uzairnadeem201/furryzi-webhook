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

    // For json type metafields in REST API, the value must be a JSON string
    const jsonStringValue = JSON.stringify(itemImages);

    console.log("Value for metafield:", jsonStringValue);

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
      const updateUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-10/metafields/${mfId}.json`;
      console.log("Updating existing metafield:", mfId);

      const updateResponse = await fetch(updateUrl, {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metafield: {
            value: jsonStringValue,
            type: "json",
          },
        }),
      });

      console.log("Update response status:", updateResponse.status);
      const updateText = await updateResponse.text();
      console.log("Update response body:", updateText);
      
      const updateData = JSON.parse(updateText);
      console.log("Update response parsed:", updateData);

      return NextResponse.json({
        message: "Metafield updated successfully",
        order_id: orderId,
        saved: itemImages,
      });
    } else {
      // Create new metafield
      console.log("Creating new metafield");

      const requestBody = {
        metafield: {
          namespace: "custom",
          key: "product_images",
          type: "json",
          value: jsonStringValue,
        },
      };

      console.log("Request body:", JSON.stringify(requestBody, null, 2));

      const createResponse = await fetch(metafieldUrl, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log("Create response status:", createResponse.status);
      const responseText = await createResponse.text();
      console.log("Create response body:", responseText);

      let createData;
      try {
        createData = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse response as JSON");
        return NextResponse.json(
          { message: "Invalid response from Shopify", response: responseText },
          { status: 500 }
        );
      }

      if (createResponse.status !== 201 && createResponse.status !== 200) {
        console.error("Failed to create metafield:", createData);
        return NextResponse.json(
          { message: "Failed to create metafield", error: createData },
          { status: createResponse.status }
        );
      }

      return NextResponse.json({
        message: "Metafield created successfully",
        order_id: orderId,
        saved: itemImages,
        metafield: createData,
      });
    }
  } catch (err) {
    console.error("Error in webhook:", err);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}