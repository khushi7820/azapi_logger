import zlib from 'zlib';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    try {
        console.log("=========== 11ZA INCOMING WEBHOOK ===========");
        console.log("BODY:", req.body);

        const body = req.body;

        // =========================
        // CONDITION 1: ONLY REAL USER INCOMING MESSAGE
        // =========================
        if (body.event !== "MoMessage") {
            console.log("Ignored: Not a real incoming user message");
            return res.status(200).json({
                success: true,
                message: "Ignored non-MoMessage webhook",
            });
        }

        // =========================
        // CONDITION 2: ONLY MEDIA CONTENT
        // =========================
        if (
            !body.content ||
            body.content.contentType !== "media" ||
            !body.content.media ||
            !body.content.media.url
        ) {
            console.log("Ignored: No valid media found");
            return res.status(200).json({
                success: true,
                message: "Ignored non-media message",
            });
        }

        const mediaUrl = body.content.media.url;
        const mediaType = body.content.media.type;
        const customerNumber = body.from;
        const messageId = body.messageId;

        console.log("=========== WEBHOOK LOGS ===========");
        console.log("Message ID:", messageId);
        console.log("Media URL:", mediaUrl);
        console.log("Media Type:", mediaType);
        console.log("Customer Number:", customerNumber);

        // =========================
        // CONDITION 3: ONLY IMAGE OR DOCUMENT
        // =========================
        if (mediaType !== "image" && mediaType !== "document") {
            console.log("Rejected: Unsupported media type:", mediaType);
            await sendWhatsappText(
                customerNumber,
                "Please send only account or billing related documents in (Image or PDF) format. Other media files are not supported."
            );
            return res.status(200).json({
                success: true,
                message: "Unsupported media type rejected",
            });
        }

        // =========================
        // CONDITION 4: VALID FILE EXTENSION ONLY
        // =========================
        const lowerUrl = mediaUrl.toLowerCase();
        const allowedExtensions = [".jpg", ".jpeg", ".png", ".pdf"];
        const isAllowedFile = allowedExtensions.some((ext) => lowerUrl.includes(ext));

        console.log("File extension check:", isAllowedFile ? "PASSED" : "FAILED");

        if (!isAllowedFile) {
            console.log("Rejected: Unsupported file extension");
            await sendWhatsappText(
                customerNumber,
                "Please send only JPG, PNG or PDF account related files. Excel, video, audio or unsupported files are not accepted."
            );
            return res.status(200).json({
                success: true,
                message: "Unsupported file extension rejected",
            });
        }

        // =========================
        // CALL AZAPI OCR
        // =========================
        console.log("=========== CALLING AZAPI OCR ===========");
        console.log("File URL:", mediaUrl);

        const azapiResponse = await fetch("https://adv-ocr.azapi.ai/ind0003b", {
            method: "POST",
            headers: {
                Authorization: "prod-da871e689cafe6a197237890690bd70e428f733e75ea8a1e61e0303243ffa823",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ file: mediaUrl }),
        });

        console.log("AZAPI Status:", azapiResponse.status);
        const azapiResult = await azapiResponse.json();
        console.log("=========== OCR RESPONSE RECEIVED ===========");
        console.log("OCR Status:", azapiResult?.status);
        console.log("OCR Pages:", azapiResult?.no_of_pages);

        // =========================
        // VALIDATE OCR RESPONSE
        // =========================
        if (!azapiResult || azapiResult.error || azapiResult.status === "failed") {
            console.log("OCR Error:", azapiResult?.error || "Unknown error");
            return res.status(200).json({
                success: false,
                message: "OCR processing failed or returned error",
            });
        }

        // =========================
        // CLEAN AND MINIFY JSON
        // =========================
        console.log("=========== CLEANING OCR RESULT ===========");
        const cleanResult = {
            no_of_pages: azapiResult.no_of_pages,
            pages: {}
        };

        for (const key in azapiResult) {
            if (key.startsWith('page-')) {
                const pageData = azapiResult[key];
                if (Array.isArray(pageData) && pageData[0]) {
                    cleanResult.pages[key] = pageData[0].output;
                    console.log("Page found:", key);
                }
            }
        }

        if (Object.keys(cleanResult.pages).length === 0 && azapiResult.output) {
            cleanResult.pages["page-1"] = azapiResult.output;
            console.log("Fallback: using top-level output");
        }

        if (Object.keys(cleanResult.pages).length === 0) {
            console.log("Ignored: OCR returned no content pages");
            return res.status(200).json({
                success: false,
                message: "OCR returned empty result, skipping file delivery",
            });
        }

        console.log("Total pages extracted:", Object.keys(cleanResult.pages).length);

        // Fix invoice_items: parallel arrays → array of objects (all pages)
        const fixItems = (inv) => { if (inv?.invoice_items?.["sr no."]) inv.invoice_items = inv.invoice_items["sr no."].map((_, i) => Object.fromEntries(Object.entries(inv.invoice_items).map(([k, v]) => [k, v[i]]))); };
        Object.values(cleanResult.pages).forEach(page => Array.isArray(page) ? page.forEach(fixItems) : fixItems(page));

        let rawJsonText = JSON.stringify(cleanResult);
        rawJsonText = rawJsonText
            .replace(/AZAPI/g, "11ZA")
            .replace(/azapi/g, "11za")
            .replace(/Azapi/g, "11za");

        // =========================
        // DYNAMIC FILE NAME
        // =========================
        const summary = azapiResult?.["page-1"]?.[0]?.output?.invoice_summary || azapiResult?.output?.invoice_summary;
        const invoiceNo = summary?.["invoice no"] || summary?.["credit note no"] || "NO-INVOICE";
        const invoiceDate = summary?.["invoice date"] || summary?.["credit note date"] || "NO-DATE";

        let fileName = `${invoiceDate}-${invoiceNo}.txt`;
        fileName = fileName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.-]/g, '');
        console.log("Generated filename:", fileName);

        // =========================
        // SAVE TO SUPABASE (UNLIMITED SIZE)
        // =========================
        console.log("=========== SAVING TO SUPABASE ===========");
        const { data, error } = await supabase
            .from('ocr_logs')
            .insert([{
                content: rawJsonText,
                filename: fileName,
                message_id: messageId
            }])
            .select()
            .single();

        if (error) {
            console.log("Supabase Error:", error);
            if (error.code === '23505') {
                console.log("Duplicate Message: Already processed messageId", messageId);
                return res.status(200).json({
                    success: true,
                    message: "Duplicate message ignored",
                });
            }
            throw error;
        }

        console.log("Supabase Save Success, ID:", data.id);

        const publicFileUrl = `https://azapi-logger.vercel.app/files/${data.id}/${fileName}`;

        console.log("=========== GENERATED PERMANENT URL ===========");
        console.log(publicFileUrl);

        await sendWhatsappDocument(customerNumber, publicFileUrl, fileName);

        return res.status(200).json({
            success: true,
            message: "OCR processed and link sent to WhatsApp",
            filename: fileName,
        });

    } catch (error) {
        console.log("=========== ERROR ===========");
        console.log("Error Message:", error.message);
        console.log("Error Stack:", error.stack);
        return res.status(500).json({
            success: false,
            error: error.message,
        });
    }
}

// =========================
// SEND NORMAL TEXT
// =========================
async function sendWhatsappText(customerNumber, messageText) {
    const token = process.env.WHATSAPP_TOKEN;
    const origin = process.env.ORIGIN_WEBSITE;

    console.log("=========== TEXT SEND DEBUG ===========");
    console.log("Token:", token ? "SET ✓" : "MISSING ✗");
    console.log("Origin:", origin);
    console.log("To:", customerNumber);
    console.log("Message:", messageText);

    const payload = {
        sendto: customerNumber,
        authToken: token,
        originWebsite: origin,
        contentType: "text",
        text: messageText,
    };

    console.log("Payload:", JSON.stringify(payload));

    const sendResp = await fetch("https://api.11za.in/apis/sendMessage/sendMessages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    const responseText = await sendResp.text();
    console.log("=========== TEXT SEND RESPONSE ===========");
    console.log("Status:", sendResp.status);
    console.log("Response:", responseText);
}

// =========================
// SEND DOCUMENT
// =========================
async function sendWhatsappDocument(customerNumber, fileUrl, fileName) {
    const token = process.env.WHATSAPP_TOKEN;
    const origin = process.env.ORIGIN_WEBSITE;

    console.log("=========== DOCUMENT SEND DEBUG ===========");
    console.log("Token:", token ? "SET ✓" : "MISSING ✗");
    console.log("To:", customerNumber);
    console.log("File URL:", fileUrl);
    console.log("File Name:", fileName);

    const payload = {
        sendto: customerNumber,
        authToken: token,
        originWebsite: origin,
        contentType: "document",
        myfile: fileUrl,
        filename: fileName,
    };

    const sendResp = await fetch("https://api.11za.in/apis/sendMessage/sendMessages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    const responseText = await sendResp.text();
    console.log("=========== DOCUMENT SEND RESPONSE ===========");
    console.log("Status:", sendResp.status);
    console.log("Response:", responseText);
}