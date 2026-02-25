import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertIsNonEmptyString } from "@/lib/validators/auth";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const firstName = assertIsNonEmptyString(body.firstName, "firstName");
    const lastName = assertIsNonEmptyString(body.lastName, "lastName");
    const email = assertIsNonEmptyString(body.email, "email");
    const phone = assertIsNonEmptyString(body.phone, "phone");

    try {
      const admin = createSupabaseAdminClient();

      let page = 1;
      const perPage = 1000;
      let foundConfirmed = false;

      // Supabase doesn't provide a direct getUserByEmail; scan a few pages.
      // This is server-side only and stops early once a match is found.
      while (page <= 10) {
        const { data, error: listError } = await admin.auth.admin.listUsers({
          page,
          perPage,
        });

        if (listError) {
          console.error("/api/auth/signup-otp listUsers error", {
            message: listError.message,
          });
          break;
        }

        const users = data?.users ?? [];
        const match = users.find(
          (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
        );

        if (match) {
          const confirmed = Boolean((match as any).email_confirmed_at || (match as any).confirmed_at);
          foundConfirmed = confirmed;
          break;
        }

        if (users.length < perPage) {
          break;
        }

        page += 1;
      }

      if (foundConfirmed) {
        return NextResponse.json(
          {
            ok: false,
            code: "USER_ALREADY_REGISTERED",
            error: "user already registered",
          },
          { status: 409 },
        );
      }
    } catch (e) {
      console.error("/api/auth/signup-otp existing user check exception", e);
    }

    const supabase = await createSupabaseServerClient();

    const displayName = `${firstName} ${lastName}`.trim();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          full_name: displayName,
          display_name: displayName,
          phone,
        },
      },
    });

    if (error) {
      console.error("/api/auth/signup-otp supabase error", {
        message: error.message,
        status: error.status,
      });
      const status =
        error.status === 429 || /rate limit/i.test(error.message) ? 429 : 400;
      return NextResponse.json({ ok: false, error: error.message }, { status });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("/api/auth/signup-otp unhandled error", e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
