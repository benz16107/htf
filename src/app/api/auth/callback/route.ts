import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: Request) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const next = requestUrl.searchParams.get('next') ?? '/setup/baselayer'

    if (code) {
        const cookieStore = await cookies()
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            )
                        } catch {
                            // The `setAll` method was called from a Server Component.
                            // This can be ignored if you have middleware refreshing
                            // user sessions.
                        }
                    },
                },
            }
        )
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            return NextResponse.redirect(`${requestUrl.origin}${next}`)
        } else {
            console.error('Supabase OAuth Error:', error)
            return NextResponse.redirect(`${requestUrl.origin}/sign-in?message=${encodeURIComponent(error.message)}`)
        }
    }

    // Handle errors returned from the OAuth provider (e.g., user cancelled)
    const errorDescription = requestUrl.searchParams.get('error_description')
    if (errorDescription) {
        return NextResponse.redirect(`${requestUrl.origin}/sign-in?message=${encodeURIComponent(errorDescription)}`)
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${requestUrl.origin}/sign-in?message=Could not authenticate user`)
}
