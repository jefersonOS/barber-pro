import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
	const response = NextResponse.next({
		request: { headers: request.headers },
	});

	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

	if (!supabaseUrl || !supabaseAnonKey) {
		return response;
	}

	const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
		cookies: {
			getAll() {
				return request.cookies.getAll();
			},
			setAll(cookiesToSet) {
				cookiesToSet.forEach(({ name, value, options }) => {
					response.cookies.set(name, value, options);
				});
			},
		},
	});

	const {
		data: { user },
	} = await supabase.auth.getUser();

	const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
	const isLogin = request.nextUrl.pathname.startsWith("/login");

	if (isDashboard && !user) {
		const url = request.nextUrl.clone();
		url.pathname = "/login";
		url.searchParams.set("next", request.nextUrl.pathname);
		return NextResponse.redirect(url);
	}

	if (isLogin && user) {
		const url = request.nextUrl.clone();
		url.pathname = "/dashboard";
		url.search = "";
		return NextResponse.redirect(url);
	}

	return response;
}

export const config = {
	matcher: ["/dashboard/:path*", "/login"],
};
