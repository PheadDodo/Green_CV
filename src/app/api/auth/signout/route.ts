import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-origin";
import { signOut } from "@/lib/auth";

export async function POST(request: Request) {
  await signOut();
  return NextResponse.redirect(new URL("/login", getAppOrigin(request.url)), 303);
}
