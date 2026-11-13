// Shown inside the workspace while the next page is being prepared on the server.
export default function Loading() {
  return <div className="staff-workspace live-inner"><div role="status" className="loading-block page-loading"><span className="spinner" aria-hidden="true" /><p>Opening page…</p></div></div>;
}
