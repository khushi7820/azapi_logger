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

        if (body.event !== "MoMessage") {
            console.log("Ignored: Not a real incoming user message");
            return res.status(200).json({ success: true, message: "Ignored non-MoMessage webhook" });
        }

        if (!body.content || body.content.contentType !== "media" || !body.content.media || !body.content.media.url) {
            console.log("Ignored: No valid media found");
            return res.status(200).json({ success: true, message: "Ignored non-media message" });
        }

        const mediaUrl = body.content.media.url;
        const mediaType = body.content.media.type;
        const customerNumber = body.from;
        const messageId = body.messageId;

        console.log("=========== WEBHOOK LOGS ===========");
        console.log("Message ID:", messageId);
        console.log("Media URL:", mediaUrl);

        if (mediaType !== "image" && mediaType !== "document") {
            await sendWhatsappText(customerNumber, "Please send only account or billing related documents in (Image or PDF) format. Other media files are not supported.");
            return res.status(200).json({ success: true, message: "Unsupported media type rejected" });
        }

        const lowerUrl = mediaUrl.toLowerCase();
        const allowedExtensions = [".jpg", ".jpeg", ".png", ".pdf"];
        const isAllowedFile = allowedExtensions.some((ext) => lowerUrl.includes(ext));

        if (!isAllowedFile) {
            await sendWhatsappText(customerNumber, "Please send only JPG, PNG or PDF account related files. Excel, video, audio or unsupported files are not accepted.");
            return res.status(200).json({ success: true, message: "Unsupported file extension rejected" });
        }

        const azapiResponse = await fetch("https://adv-ocr.azapi.ai/ind0003b", {
            method: "POST",
            headers: {
                Authorization: "prod-da871e689cafe6a197237890690bd70e428f733e75ea8a1e61e0303243ffa823",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ file: mediaUrl }),
        });

        const azapiResult = await azapiResponse.json();
        console.log("=========== OCR RESPONSE RECEIVED ===========");

        if (!azapiResult || azapiResult.error || azapiResult.status === "failed") {
            console.log("OCR Error:", azapiResult?.error || "Unknown error");
            return res.status(200).json({ success: false, message: "OCR processing failed or returned error" });
        }

        const cleanResult = { no_of_pages: azapiResult.no_of_pages, pages: {} };

        for (const key in azapiResult) {
            if (key.startsWith('page-')) {
                const pageData = azapiResult[key];
                if (Array.isArray(pageData) && pageData[0]) {
                    cleanResult.pages[key] = pageData[0].output;
                }
            }
        }

        if (Object.keys(cleanResult.pages).length === 0 && azapiResult.output) {
            cleanResult.pages["page-1"] = azapiResult.output;
        }

        if (Object.keys(cleanResult.pages).length === 0) {
            console.log("Ignored: OCR returned no content pages");
            return res.status(200).json({ success: false, message: "OCR returned empty result, skipping file delivery" });
        }

        const fixItems = (inv) => { if (inv?.invoice_items?.["sr no."]) inv.invoice_items = inv.invoice_items["sr no."].map((_, i) => Object.fromEntries(Object.entries(inv.invoice_items).map(([k, v]) => [k, v[i]]))); };
        Object.values(cleanResult.pages).forEach(page => Array.isArray(page) ? page.forEach(fixItems) : fixItems(page));

        let rawJsonText = JSON.stringify(cleanResult);
        rawJsonText = rawJsonText.replace(/AZAPI/g, "11ZA").replace(/azapi/g, "11za").replace(/Azapi/g, "11za");

        const summary = azapiResult?.["page-1"]?.[0]?.output?.invoice_summary || azapiResult?.output?.invoice_summary;
        const invoiceNo = summary?.["invoice no"] || summary?.["credit note no"] || "NO-INVOICE";
        const invoiceDate = summary?.["invoice date"] || summary?.["credit note date"] || "NO-DATE";

        let fileName = `${invoiceDate}-${invoiceNo}.txt`;
        fileName = fileName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.-]/g, '');

        const { data, error } = await supabase
            .from('ocr_logs')
            .insert([{ content: rawJsonText, filename: fileName, message_id: messageId }])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                console.log("Duplicate Message: Already processed messageId", messageId);
                return res.status(200).json({ success: true, message: "Duplicate message ignored" });
            }
            throw error;
        }

        const publicFileUrl = `https://azapi-logger.vercel.app/files/${data.id}/${fileName}`;

        console.log("=========== GENERATED PERMANENT URL ===========");
        console.log(publicFileUrl);

        // Send as text message with download link
        await sendWhatsappText(customerNumber, `Invoice processed! Download here: ${publicFileUrl}`);

        return res.status(200).json({ success: true, message: "OCR processed and link sent to WhatsApp", filename: fileName });

    } catch (error) {
        console.log("=========== ERROR ===========");
        console.log(error);
        return res.status(500).json({ success: false, error: error.message });
    }
}

async function sendWhatsappText(customerNumber, messageText) {
    const sendResp = await fetch("https://api.11za.in/apis/sendMessage/sendMessages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            sendto: customerNumber,
            authToken: process.env.WHATSAPP_TOKEN,
            originWebsite: process.env.ORIGIN_WEBSITE,
            contentType: "text",
            text: messageText,
        }),
    });
    console.log("=========== TEXT SEND RESPONSE ===========");
    console.log(await sendResp.text());
}

async function sendWhatsappDocument(customerNumber, fileUrl, fileName) {
    const sendResp = await fetch("https://api.11za.in/apis/sendMessage/sendMessages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            sendto: customerNumber,
            authToken: process.env.WHATSAPP_TOKEN,
            originWebsite: process.env.ORIGIN_WEBSITE,
            contentType: "document",
            myfile: fileUrl,
            filename: fileName,
        }),
    });
    console.log("=========== DOCUMENT SEND RESPONSE ===========");
    console.log(await sendResp.text());
}