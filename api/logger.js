export default async function handler(req, res) {
    try {
        console.log("=========== 11ZA INCOMING WEBHOOK ===========");
        console.log("BODY:", req.body);

        const mediaUrl = req.body?.content?.media?.url;

        if (!mediaUrl) {
            return res.status(200).json({
                success: false,
                message: "No media URL found in incoming webhook payload"
            });
        }

        console.log("=========== MEDIA URL EXTRACTED ===========");
        console.log(mediaUrl);

        const azapiResponse = await fetch("https://adv-ocr.azapi.ai/ind0003b", {
            method: "POST",
            headers: {
                "Authorization": "prod-da871e689cafe6a197237890690bd70e428f733e75ea8a1e61e0303243ffa823",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                file: mediaUrl
            })
        });

        const azapiJson = await azapiResponse.json();

        console.log("=========== AZAPI OCR RESPONSE ===========");
        console.log(JSON.stringify(azapiJson, null, 2));

        return res.status(200).json({
            success: true,
            mediaUrl: mediaUrl,
            azapiResult: azapiJson,
            processedAt: new Date().toISOString()
        });

    } catch (error) {
        console.log("=========== ERROR ===========");
        console.log(error);

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}