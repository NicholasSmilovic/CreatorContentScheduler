import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { seriesApi } from "../api/client";

export default function SeriesList() {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    seriesApi
      .list()
      .then((data) => {
        if (!cancelled) setSeries(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Series could not be loaded");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="loading">Loading series...</div>;

  return (
    <div className="series-list-page">
      <div className="page-header">
        <h1>Content series</h1>
        <Link to="/series/new" className="btn primary">New Series</Link>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table className="posts-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Platform</th>
              <th>Series start</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {series.length === 0 ? (
              <tr>
                <td colSpan={4}>No series yet. <Link to="/series/new">Create one</Link>.</td>
              </tr>
            ) : (
              series.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link to={`/series/${item.id}`} className="series-link">
                      {item.name}
                    </Link>
                  </td>
                  <td><span className="platform">{item.platform}</span></td>
                  <td>{format(new Date(item.starts_at), "MMM d, yyyy HH:mm")}</td>
                  <td>
                    <Link to={`/series/${item.id}`} className="btn small">Open</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
