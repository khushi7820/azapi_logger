export default async function handler(req, res) {
    try {
        const customerNumber = req.query.number; // Pass your number in the URL

        if (!customerNumber) {
            return res.status(400).send("Please provide a WhatsApp number, e.g., /api/test-whatsapp?number=919876543210");
        }

        const mockResult = {
            output: {
                invoice_summary: {
                    "invoice no": "TEST-123",
                    "invoice date": "15-08-2023"
                }
            }
        };

        const rawJsonText = JSON.stringify(mockResult, null, 2);

        let fileName = "15-08-2023-TEST-123.txt";

        // Generate Base64 Data URI
        const base64Content = Buffer.from(rawJsonText).toString('base64');
        const publicFileUrl = "https://azapi-logger.vercel.app/files/fd9701fa-118d-475b-9d79-c9a8f304ce63/06-05-2026-503.txt";

        // Send to WhatsApp using the exact same function
        const sendResp = await fetch("https://api.11za.in/apis/sendMessage/sendMessages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                sendto: customerNumber,
                authToken: "U2FsdGVkX1/GSGw08kH2fHtWj+keT0Rm14t+hfin1u8N4s4dqa/T9zz+AF1c7EWbsbNHva0D+rqL8tEAhPKsOkKVqOFx4UEcb6sidokcPXyI4kYclzpc0yrAX6op/CYZnZT4QXZOb48gSQlA6LK3aXZpapYbPlS0TT3G4wHpVxMMwobYQhnr6RCqElAXQr+o",
                myfile: publicFileUrl,
                filename: fileName,
            }),
        });

        const respText = await sendResp.text();

        return res.status(200).json({
            success: true,
            message: "Test completed. Check your WhatsApp.",
            apiResponse: respText
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
