export function RawResponse({ data }: { data: unknown }) {
  if (data === undefined || data === null) return null;
  return (
    <details open>
      <summary>Raw Response</summary>
      <pre className="raw-response">{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}
