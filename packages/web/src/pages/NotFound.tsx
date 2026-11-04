import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <>
      <h2>Page not found</h2>
      <Link to="/">Back to the overview</Link>
    </>
  );
}
