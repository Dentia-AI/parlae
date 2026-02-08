import 'server-only';

const TURNSTILE_VERIFY_ENDPOINT =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const CAPTCHA_SECRET_TOKEN = process.env.CAPTCHA_SECRET_TOKEN;

export async function verifyCaptchaToken(token: string) {
  if (!CAPTCHA_SECRET_TOKEN) {
    throw new Error('CAPTCHA_SECRET_TOKEN is not set');
  }

  const formData = new FormData();

  formData.append('secret', CAPTCHA_SECRET_TOKEN);
  formData.append('response', token);

  const response = await fetch(TURNSTILE_VERIFY_ENDPOINT, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to verify CAPTCHA token');
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error('Invalid CAPTCHA token');
  }
}
