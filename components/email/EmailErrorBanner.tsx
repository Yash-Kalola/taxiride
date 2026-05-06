'use client';
import { useState } from 'react';
import { prettifyEmailError } from '@/lib/smtp-errors';

/**
 * Friendly banner for email-send failures. Translates technical SMTP errors
 * (e.g. "535 5.7.139 Authentication unsuccessful…") into a plain-English
 * title + cause + suggested action, with the original error tucked away in
 * a collapsible "Technical details" section for debugging.
 */
export default function EmailErrorBanner({
  rawError,
  prefix,
  className = '',
}: {
  rawError: string | null | undefined;
  /** Optional prefix sentence, e.g. "Invoice marked as sent." */
  prefix?: string;
  className?: string;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const friendly = prettifyEmailError(rawError);
  if (!friendly) return null;

  return (
    <div className={`rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200 ${className}`}>
      {prefix && <p className="font-medium mb-1">{prefix}</p>}
      <p className="font-semibold">⚠ {friendly.title}</p>
      {friendly.cause && (
        <p className="mt-1 text-amber-700">{friendly.cause}</p>
      )}
      {friendly.action && (
        <p className="mt-1.5 text-amber-900">
          <span className="font-semibold">What to do: </span>{friendly.action}
        </p>
      )}
      <button
        onClick={() => setShowDetails((s) => !s)}
        className="mt-2 text-xs font-medium text-amber-700 hover:text-amber-900 underline"
      >
        {showDetails ? 'Hide' : 'Show'} technical details
      </button>
      {showDetails && (
        <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-white/60 px-2 py-1.5 text-[11px] font-mono text-amber-950 ring-1 ring-amber-200">
          {friendly.raw}
        </pre>
      )}
    </div>
  );
}
