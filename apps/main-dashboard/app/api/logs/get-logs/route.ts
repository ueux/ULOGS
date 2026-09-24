import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { getToken } = await auth();
    const token = await getToken();

    if (!token) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const incomingUrl = new URL(request.url);
    const query = incomingUrl.searchParams;
    if (!query.has("range")) query.set("range", "24h");

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SERVER_URI}/logs/get-dashboard-logs?${query.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "Upstream ULOGS server error" },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to fetch dashboard logs", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
