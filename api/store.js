import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    try {
        const { id } = req.query;

        if (!id) {
            return res.status(400).send("No ID provided");
        }

        // Fetch from Supabase
        const { data, error } = await supabase
            .from('ocr_logs')
            .select('content, filename')
            .eq('id', id)
            .single();

        if (error || !data) {
            return res.status(404).send("File not found");
        }

        let fileContent = data.content;
        const name = data.filename || "invoice.txt";

        // Pretty print if it's JSON
        try {
            const jsonObj = JSON.parse(fileContent);
            fileContent = JSON.stringify(jsonObj, null, 2);
        } catch (e) {
            // Not JSON, keep as is
        }

        // Set headers for file download
        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
        
        res.status(200).send(fileContent);
    } catch (error) {
        res.status(500).send("Store file error: " + error.message);
    }
}
