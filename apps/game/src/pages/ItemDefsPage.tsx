import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { contentApi } from '../api/meta';
import type { MetaItemDef as ItemDef } from '@org/shared';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';

export function ItemDefsPage() {
  const [items, setItems] = useState<ItemDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    contentApi.listItemDefs()
      .then(setItems)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page">
      <h1>Item Definitions</h1>
      <ErrorMessage error={error} />
      {items.length === 0 && !error && <p>No item definitions found.</p>}
      {items.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Category</th>
              <th>Rarity</th>
              <th>Stackable</th>
              <th>Tradeable</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.defId}>
                <td><Link to={`/content/items/${item.defId}`}>{item.defId}</Link></td>
                <td>{item.name}</td>
                <td>{item.category}</td>
                <td>{item.rarity}</td>
                <td>{item.stackable ? `yes (max ${item.maxStack})` : 'no'}</td>
                <td>{item.tradeable ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
