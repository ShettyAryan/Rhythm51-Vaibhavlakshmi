import { errorResponse } from "@/lib/api";
import { assertSameOrigin, clientIp, login } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = loginSchema.parse(await request.json().catch(() => ({})));
    const user = await login(body.email, body.password, await clientIp(), request.headers.get("user-agent") ?? "");
    return Response.json({ ok: true, user: { email: user.email, name: user.name } });
  } catch (err) {
    return errorResponse(err);
  }
}
