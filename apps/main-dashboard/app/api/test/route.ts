import { logger } from "@/lib/logs";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    for (let index = 0; index < 6; index++) {

      await logger.error({
        message: "Dont log the secrete",
        importance: "critical",
        service: "testing",
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log(error);
  }
}
