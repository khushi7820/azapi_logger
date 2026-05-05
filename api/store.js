import { getTempFile } from "../memoryStore.js";

export default async function handler(req, res) {
    try {
        const id = req.query.id;

        const fileContent = getTempFile(id);

        if (!fileContent) {
            return res.status(404).send("File not found");
        }

        res.setHeader("Content-Type", "text/plain");
        res.status(200).send(fileContent);
    } catch (error) {
        res.status(500).send("Store file error");
    }
}