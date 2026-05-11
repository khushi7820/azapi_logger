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
        const messageId = body.messageId; // Unique ID for each incoming message

        console.log("=========== WEBHOOK LOGS ===========");
        console.log("Message ID:", messageId);
        console.log("Media URL:", mediaUrl);

        // =========================
        // CONDITION 3: ONLY IMAGE OR DOCUMENT
        // =========================
        if (mediaType !== "image" && mediaType !== "document") {
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

        if (!isAllowedFile) {
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
        const azapiResponse = await fetch("https://adv-ocr.azapi.ai/ind0003b", {
            method: "POST",
            headers: {
                Authorization:
                    "prod-da871e689cafe6a197237890690bd70e428f733e75ea8a1e61e0303243ffa823",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                file: mediaUrl,
            }),
        });

        const azapiResult = await azapiResponse.json();
        console.log("=========== OCR RESPONSE RECEIVED ===========");

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
        const cleanResult = {
            no_of_pages: azapiResult.no_of_pages,
            pages: {}
        };

        for (const key in azapiResult) {
            if (key.startsWith('page-')) {
                const pageData = azapiResult[key];
                // pageData is an array [dataObject, statusCode]
                if (Array.isArray(pageData) && pageData[0]) {
                    cleanResult.pages[key] = pageData[0].output;
                }
            }
        }

        // Fallback: If no "page-X" keys were found, try to use the top-level output (for single page)
        if (Object.keys(cleanResult.pages).length === 0 && azapiResult.output) {
            cleanResult.pages["page-1"] = azapiResult.output;
        }

        // =========================
        // FINAL VALIDATION: NO DATA FOUND
        // =========================
        if (Object.keys(cleanResult.pages).length === 0) {
            console.log("Ignored: OCR returned no content pages");
            return res.status(200).json({
                success: false,
                message: "OCR returned empty result, skipping file delivery",
            });
        }

        let rawJsonText = JSON.stringify(cleanResult); // Minified

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
        // Sanitize filename
        fileName = fileName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.-]/g, '');

        // =========================
        // SAVE TO SUPABASE (UNLIMITED SIZE)
        // =========================
        const { data, error } = await supabase
            .from('ocr_logs')
            .insert([{
                content: rawJsonText,
                filename: fileName,
                message_id: messageId // Used for deduplication
            }])
            .select()
            .single();

        if (error) {
            // Handle duplicate messageId (Unique constraint violation)
            if (error.code === '23505') {
                console.log("Duplicate Message: Already processed messageId", messageId);
                return res.status(200).json({
                    success: true,
                    message: "Duplicate message ignored",
                });
            }
            throw error;
        }

        const publicFileUrl = `https://azapi-logger.vercel.app/files/${data.id}/${fileName}`;

        console.log("=========== GENERATED PERMANENT URL ===========");
        console.log(publicFileUrl);

        await sendWhatsappDocument(customerNumber, publicFileUrl, fileName);

        return res.status(200).json({
            success: true,
            message: "OCR processed and TXT file sent to WhatsApp",
            filename: fileName,
        });
    } catch (error) {
        console.log("=========== ERROR ===========");
        console.log(error);

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
    const sendResp = await fetch("https://api.11za.in/apis/sendMessage/sendMessages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            sendto: customerNumber,
            authToken:
                "U2FsdGVkX1/25Ds87RAiqVKbeSF5lK1VDaZ01PACzOMzSonYJUauutr39681t9qeZA/jdFyGKnPTaQWMqmIymD8vLk8mujGqIt1lpYTJy/JetykxddMWSOwE7aVaC/fEjsCVHnHyc7HzqjuALJTkHnlA5sQXiTazW/YyPjGMTVnyyqemwp2XWnqx+MObrx2f",
            originWebsite: "https://weavekaari.com/",
            contentType: "text",
            text: messageText,
        }),
    });

    console.log(await sendResp.text());
}

// =========================
// SEND DOCUMENT
// =========================
async function sendWhatsappDocument(customerNumber, fileUrl, fileName) {
    const sendResp = await fetch("https://api.11za.in/apis/sendMessage/sendMessages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            sendto: customerNumber,
            authToken:
                "U2FsdGVkX1/25Ds87RAiqVKbeSF5lK1VDaZ01PACzOMzSonYJUauutr39681t9qeZA/jdFyGKnPTaQWMqmIymD8vLk8mujGqIt1lpYTJy/JetykxddMWSOwE7aVaC/fEjsCVHnHyc7HzqjuALJTkHnlA5sQXiTazW/YyPjGMTVnyyqemwp2XWnqx+MObrx2f",
            originWebsite: "https://weavekaari.com/",
            contentType: "document",
            myfile: fileUrl,
            filename: fileName, // Some APIs use this to set the name of the document
        }),
    });

    console.log("=========== DOCUMENT SEND RESPONSE ===========");
    console.log(await sendResp.text());
}