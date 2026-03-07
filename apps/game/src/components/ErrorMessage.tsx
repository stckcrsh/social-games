export function ErrorMessage({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return <div className="error-message">{msg}</div>;
}
