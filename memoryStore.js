const tempFiles = new Map();

export function saveTempFile(id, content) {
    tempFiles.set(id, content);
}

export function getTempFile(id) {
    return tempFiles.get(id);
}