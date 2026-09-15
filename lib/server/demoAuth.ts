/** Local-demo subject header. Honored ONLY when LAB_DEMO_STORE=1 (localhost
 * synthetic demo). Production and staging always resolve subjects through the
 * managed auth provider, never this header. */
export function demoSubject(req: Request): string | null {
  if (process.env.LAB_DEMO_STORE !== '1') return null;
  const v = (req.headers.get('x-demo-subject') ?? '').trim();
  return v.length > 0 && v.length <= 120 ? v : null;
}
