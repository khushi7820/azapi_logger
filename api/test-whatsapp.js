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
        const dataUri = `data:text/plain;base64,${base64Content}`;

        // Send to WhatsApp using the exact same function
        const sendResp = await fetch("https://api.11za.in/apis/sendMessage/sendMessages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                sendto: customerNumber,
                authToken: "U2FsdGVkX1/25Ds87RAiqVKbeSF5lK1VDaZ01PACzOMzSonYJUauutr39681t9qeZA/jdFyGKnPTaQWMqmIymD8vLk8mujGqIt1lpYTJy/JetykxddMWSOwE7aVaC/fEjsCVHnHyc7HzqjuALJTkHnlA5sQXiTazW/YyPjGMTVnyyqemwp2XWnqx+MObrx2f",
                originWebsite: "https://weavekaari.com/",
                contentType: "document",
                myfile: dataUri,
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
