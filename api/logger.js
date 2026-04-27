export default async function handler(req, res) {
    console.log("=========== 11ZA INCOMING WEBHOOK ===========");
    console.log("FULL URL:", req.url);
    console.log("METHOD:", req.method);
    console.log("HEADERS:", req.headers);
    console.log("BODY:", req.body);
    console.log("TIME:", new Date().toISOString());
    console.log("=============================================");

    return res.status(200).json({
        success: true,
        message: "Webhook captured successfully",
        requestUrl: req.url,
        requestMethod: req.method,
        requestHeaders: req.headers,
        requestBody: req.body,
        capturedAt: new Date().toISOString()
    });
}