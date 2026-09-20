import { auth } from "@clerk/nextjs/server";
import { ULOGSTransport } from "@ulogs/next";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.pathname.split("/")[3];
  if (!type) {
    return Response.json(
      { error: "Request Type is required" },
      { status: 400 },
    );
  }
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ulogs = new ULOGSTransport({
    apiKey: process.env.ULOGS_API_KEY!,
    appName: process.env.ULOGS_APP_NAME!,
    environment: process.env.ULOGS_ENVIRONMENT || "development",
  });
  if (type === "stream") {
    const filters = Object.fromEntries(req.nextUrl.searchParams.entries());
    const { body } = ulogs.stream(filters);

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } else if (type === "logs") {
    const filters = Object.fromEntries(req.nextUrl.searchParams.entries());
    const logs = await ulogs.get(filters);
    return Response.json(logs);
  } else {
    return Response.json({ error: "Invalid Request Type" }, { status: 400 });
  }
}
