import { saveTempFile } from "../memoryStore.js";

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

        console.log("=========== MEDIA URL EXTRACTED ===========");
        console.log(mediaUrl);

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

        console.log("=========== AZAPI RESPONSE ===========");
        console.log(JSON.stringify(azapiResult, null, 2));

        let rawJsonText = JSON.stringify(azapiResult, null, 2);

        rawJsonText = rawJsonText
            .replace(/AZAPI/g, "11ZA")
            .replace(/azapi/g, "11za")
            .replace(/Azapi/g, "11za");

        // =========================
        // DYNAMIC FILE NAME
        // =========================
        const invoiceNo =
            azapiResult?.output?.invoice_summary?.["invoice no"] || "NO-INVOICE";

        const invoiceDate =
            azapiResult?.output?.invoice_summary?.["invoice date"] || "NO-DATE";

        let fileName = `${invoiceDate}-${invoiceNo}.txt`;
        // Sanitize filename: replace spaces with dashes and remove any non-alphanumeric/dash/dot characters
        fileName = fileName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.-]/g, '');

        // =========================
        // TEMP STORE FILE CONTENT
        // =========================
        const fileId = Date.now().toString();
        saveTempFile(fileId, rawJsonText);

        const publicFileUrl = `https://azapi-logger.vercel.app/api/store?id=${fileId}&name=${encodeURIComponent(fileName)}`;

        console.log("=========== GENERATED TXT URL ===========");
        console.log(publicFileUrl);

        // =========================
        // SEND TXT DOCUMENT TO WHATSAPP
        // =========================
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