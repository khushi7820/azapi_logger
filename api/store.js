export default async function handler(req, res) {
    try {
        const dataParam = req.query.data;
        const name = req.query.name || "invoice.txt";

        if (!dataParam) {
            return res.status(400).send("No data provided");
        }

        // Decode the base64 data
        const fileContent = Buffer.from(dataParam, 'base64').toString('utf-8');

        // Set headers for file download
        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
        
        res.status(200).send(fileContent);
    } catch (error) {
        res.status(500).send("Store file error: " + error.message);
    }
}
