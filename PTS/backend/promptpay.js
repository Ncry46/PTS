/**
 * Build PromptPay EMVCo QR payload (Tag 29 — mobile / national ID).
 * Used for displaying a scannable PromptPay QR on the user payment page.
 */
function crc16Ccitt(payload) {
    let crc = 0xffff;
    for (let i = 0; i < payload.length; i += 1) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let b = 0; b < 8; b += 1) {
            crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
            crc &= 0xffff;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(id, value) {
    const v = String(value == null ? '' : value);
    return `${id}${String(v.length).padStart(2, '0')}${v}`;
}

function normalizePromptPayTarget(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 15) {
        // National ID / Tax ID
        return { aid: 'A000000677010111', target: digits.padStart(13, '0').slice(-13) };
    }
    // Mobile: convert 0XXXXXXXXX → 66XXXXXXXXX
    let mobile = digits;
    if (mobile.startsWith('0')) mobile = `66${mobile.slice(1)}`;
    if (!mobile.startsWith('66')) mobile = `66${mobile}`;
    return { aid: 'A000000677010111', target: mobile };
}

function buildPromptPayPayload(promptPayId, amount) {
    const { aid, target } = normalizePromptPayTarget(promptPayId);
    const merchant = tlv('00', aid) + tlv('01', target);
    const amountNum = Number(amount);
    const amountStr = Number.isFinite(amountNum) && amountNum > 0
        ? amountNum.toFixed(2)
        : null;

    let payload = '';
    payload += tlv('00', '01'); // Payload Format Indicator
    payload += tlv('01', amountStr ? '12' : '11'); // POI method
    payload += tlv('29', merchant); // Merchant Account Information (PromptPay)
    payload += tlv('53', '764'); // THB
    if (amountStr) payload += tlv('54', amountStr);
    payload += tlv('58', 'TH');
    payload += '6304';
    payload += crc16Ccitt(payload);
    return payload;
}

function getPromptPayId() {
    return process.env.PROMPTPAY_ID || process.env.PTS_PROMPTPAY_ID || '0800000000';
}

module.exports = { buildPromptPayPayload, getPromptPayId, normalizePromptPayTarget };
