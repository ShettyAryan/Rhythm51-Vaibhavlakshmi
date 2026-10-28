import { errorResponse } from "@/lib/api";
import { assertSameOrigin, logout } from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await logout();
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
