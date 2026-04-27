export default async function handler(req, res) {
    try {
        console.log("=========== 11ZA INCOMING WEBHOOK ===========");
        console.log("BODY:", req.body);

        const body = req.body;

        if (
            body &&
            body.content &&
            body.content.contentType === "media" &&
            body.content.media &&
            body.content.media.url
        ) {
            const mediaUrl = body.content.media.url;
            const customerNumber = body.from;

            console.log("=========== MEDIA URL EXTRACTED ===========");
            console.log(mediaUrl);

            // CALL AZAPI OCR
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

            const rawJsonText = JSON.stringify(azapiResult, null, 2);

            const chunkSize = 3000;
            const chunks = [];

            for (let i = 0; i < rawJsonText.length; i += chunkSize) {
                chunks.push(rawJsonText.substring(i, i + chunkSize));
            }

            for (const part of chunks) {
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
                        text: part,
                    }),
                });

                console.log("=========== 11ZA SEND RESPONSE ===========");
                console.log(await sendResp.text());
            }

            return res.status(200).json({
                success: true,
                message: "OCR processed and raw JSON sent to WhatsApp",
            });
        }

        return res.status(200).json({
            success: true,
            message: "No media found",
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