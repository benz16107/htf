import { NextRequest, NextResponse } from "next/server";

// Local demo: no external auth, always allow.
export async function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
