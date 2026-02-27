/**
 * Normalizes a string for comparison:
 * - lowercase
 * - trim
 * - remove special characters (keep only alphanumeric)
 */
function normalizeString(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]/g, '');
}

module.exports = { normalizeString };
