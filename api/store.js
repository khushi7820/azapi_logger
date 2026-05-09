import zlib from 'zlib';

export default async function handler(req, res) {
    try {
        const dataParam = req.query.data;
        const name = req.query.name || "invoice.txt";

        if (!dataParam) {
            return res.status(400).send("No data provided");
        }

        // Decode the base64 data
        const buffer = Buffer.from(dataParam, 'base64');
        let fileContent;

        try {
            // Try to decompress
            fileContent = zlib.inflateSync(buffer).toString('utf-8');
            // If it's JSON, pretty print it
            try {
                const jsonObj = JSON.parse(fileContent);
                fileContent = JSON.stringify(jsonObj, null, 2);
            } catch (e) {
                // Not JSON, keep as is
            }
        } catch (error) {
            // Fallback for old uncompressed data
            fileContent = buffer.toString('utf-8');
        }

        // Set headers for file download
        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
        
        res.status(200).send(fileContent);
    } catch (error) {
        res.status(500).send("Store file error: " + error.message);
    }
}
