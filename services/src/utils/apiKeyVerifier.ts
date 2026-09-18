export function extractKeyId(palinKey: string): string | null{
    if (!palinKey || !palinKey.startsWith("ULOG_")) return null;
    const parts = palinKey.split("_");
    if (parts.length < 3) return null;
    const keyId = parts[1];
    if (!/^[a-f0-9]{32}$/i.test(keyId)) return null;
    return keyId;
}