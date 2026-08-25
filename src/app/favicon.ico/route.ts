import { NextResponse } from 'next/server';

// Redirect browser favicon requests to an existing SVG asset to avoid 404 noise.
export function GET(request: Request) {
  return NextResponse.redirect(new URL('/branding/payevo-logo-black.svg', request.url));
}
