"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { PRIMARY_ACTION, SECONDARY_ACTION, StatusPage } from "@/components/errors/status-page";

/** Any customer-app page that fails to load - replaces Next's plain default ("This page couldn't load"). `retry` re-fetches and re-renders the page. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage icon={TriangleAlert} title="This page didn't load" message="Something went wrong on our side. Try again - if it keeps happening, go back to support and start from there.">
      <button type="button" onClick={() => retry()} className={PRIMARY_ACTION}>
        <RotateCcw className="size-4" aria-hidden="true" />
        Try again
      </button>
      <Link href="/" className={SECONDARY_ACTION}>
        Back to support
      </Link>
    </StatusPage>
  );
}
