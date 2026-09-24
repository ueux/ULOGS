import { auth } from "@clerk/nextjs/server";

export async function GET() {
  try {
    const { getToken } = await auth();
    const token = await getToken();

    if (!token) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SERVER_URI}/logs/metrics/stream`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        next: { revalidate: 0 },
      },
    )

    if (!res.body) {
      return Response.json(
        { error: "Upstream stream unavailable" },
        { status: res.status },
      );
    }
    return new Response(res.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
      console.error("System metrics error", error);
      return Response.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
