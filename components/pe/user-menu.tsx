"use client";

import { useRef } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

/**
 * Avatar with a dropdown menu → sign out.
 *
 * Sign-out is a POST to /auth/signout (server route handler clears the
 * Supabase session cookie and 303s to /login). We POST from a hidden form
 * rather than using fetch() so Next's navigation model handles the redirect
 * correctly.
 */
export function UserMenu({
  userInitials,
  userEmail,
}: {
  userInitials: string;
  userEmail?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} method="post" action="/auth/signout" className="hidden" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded-full outline-none ring-offset-2 transition-shadow focus-visible:ring-2 focus-visible:ring-pe-green"
            aria-label="Account menu"
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-[11px]">{userInitials}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          {userEmail ? (
            <>
              <DropdownMenuLabel>Signed in</DropdownMenuLabel>
              <div className="px-3 pb-2 text-xs text-muted-foreground truncate">
                {userEmail}
              </div>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              formRef.current?.submit();
            }}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
