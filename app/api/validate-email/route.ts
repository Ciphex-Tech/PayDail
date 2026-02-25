import { NextRequest } from 'next/server';

interface EmailDeliverability {
  status?: string; // "deliverable", "undeliverable", "risky", "unknown"
  status_detail?: string;
  is_format_valid?: boolean;
  is_smtp_valid?: boolean;
  is_mx_valid?: boolean;
}

interface AbstractApiResponse {
  email_address?: string;
  email_deliverability?: EmailDeliverability;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email') || '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'invalid_format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = process.env.ABSTRACT_API_KEY;
    if (!apiKey) {
      console.error('ABSTRACT_API_KEY is not set');
      return new Response(
        JSON.stringify({ valid: false, reason: 'server_misconfigured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const url = `https://emailreputation.abstractapi.com/v1/?api_key=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(email)}`;
    const res = await fetch(url, { cache: 'no-store' });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'network_error' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data: AbstractApiResponse = await res.json();
    console.log("EmailReputation API Response:", data);

    const status = data?.email_deliverability?.status || 'unknown';
    const formatOk = data?.email_deliverability?.is_format_valid === true;

    // ✅ valid if format is ok AND status is not "undeliverable"
    const valid = Boolean(formatOk && status !== 'undeliverable');

    return new Response(
      JSON.stringify({
        valid,
        reason: valid ? 'ok' : status
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('validate-email route error:', err);
    return new Response(
      JSON.stringify({ valid: false, reason: 'network_error' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
