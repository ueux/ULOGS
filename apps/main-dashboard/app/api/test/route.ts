import { logger } from "@/lib/logs";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await logger.error({
      message: "Something went wrong",
      importance: "medium",
      service: "testing",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log(error);
  }
}
