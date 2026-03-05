import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // Exchange code for access/refresh tokens
  // Validate code, client_id, client_secret
  // Issue tokens (JWT or random string)
  // Return { access_token, refresh_token, token_type, expires_in }
  return NextResponse.json({
    access_token: 'sample-access-token',
    refresh_token: 'sample-refresh-token',
    token_type: 'Bearer',
    expires_in: 3600,
  });
}
