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

    // Convert order ID to GraphQL format
    const graphqlOrderId = `gid://shopify/Order/${orderId}`;

    // Use GraphQL to set metafield (works better with custom metafield definitions)
    const graphqlQuery = `
      mutation UpdateOrderMetafield($input: MetafieldsSetInput!) {
        metafieldsSet(metafields: [$input]) {
          metafields {
            id
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        ownerId: graphqlOrderId,
        namespace: "custom",
        key: "product_images",
        type: "json",
        value: JSON.stringify(itemImages),
      },
    };

    console.log("GraphQL variables:", JSON.stringify(variables, null, 2));

    const graphqlResponse = await fetch(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: graphqlQuery,
          variables: variables,
        }),
      }
    );

    const graphqlData = await graphqlResponse.json();
    console.log("GraphQL response:", JSON.stringify(graphqlData, null, 2));

    if (graphqlData.data?.metafieldsSet?.userErrors?.length > 0) {
      console.error("GraphQL errors:", graphqlData.data.metafieldsSet.userErrors);
      return NextResponse.json(
        {
          message: "Failed to set metafield",
          errors: graphqlData.data.metafieldsSet.userErrors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: "Metafield set successfully",
      order_id: orderId,
      saved: itemImages,
      metafield: graphqlData.data?.metafieldsSet?.metafields?.[0],
    });
  } catch (err) {
    console.error("Error in webhook:", err);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}