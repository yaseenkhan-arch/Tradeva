import { welcomeEmail } from './welcome.js';
import { verifyEmail } from './verify.js';
import { resetPasswordEmail } from './reset-password.js';

/**
 * One entry per email. Adding a new template means adding a row here and
 * nothing else — no switch to extend, no caller to update.
 *
 * `subject` may be a string or a function of the data, so a template can
 * personalise its subject line later without changing this shape.
 * `required` is checked before rendering: an email that goes out saying
 * "Hi undefined," or with a dead button is worse than one that never sends,
 * and these are all transactional, so a throw surfaces at the call site
 * while the request is still in hand.
 */
const TEMPLATES = {
  welcome: {
    subject: 'Welcome to Tradeva',
    required: ['name'],
    render: welcomeEmail,
  },
  verify: {
    subject: 'Verify your email address',
    required: ['name', 'verifyUrl'],
    render: verifyEmail,
  },
  'reset-password': {
    subject: 'Reset your Tradeva password',
    required: ['name', 'resetUrl'],
    render: resetPasswordEmail,
  },
};

export const EMAIL_TYPES = Object.keys(TEMPLATES);

/**
 * Build a transactional email.
 *
 * @param {'welcome'|'verify'|'reset-password'} type
 * @param {Object} data - fields the template needs (name, verifyUrl, resetUrl)
 * @returns {{ subject: string, html: string }}
 */
export function buildEmail(type, data = {}) {
  const template = TEMPLATES[type];

  if (!template) {
    throw new Error(
      `buildEmail: unknown email type "${type}". Expected one of: ${EMAIL_TYPES.join(', ')}.`
    );
  }

  const missing = template.required.filter(
    (key) => data[key] === undefined || data[key] === null || data[key] === ''
  );

  if (missing.length) {
    throw new Error(
      `buildEmail: "${type}" is missing required field(s): ${missing.join(', ')}.`
    );
  }

  const subject =
    typeof template.subject === 'function' ? template.subject(data) : template.subject;

  return {
    subject,
    html: template.render(data),
  };
}

export default buildEmail;
