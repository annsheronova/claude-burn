export async function fetchSessions(hours) {
  const response = await fetch(`/api/sessions?hours=${hours}`);
  if (!response.ok) {
    throw new Error(`sessions request failed: ${response.status}`);
  }
  return response.json();
}
