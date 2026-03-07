import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { contentApi } from '../api/meta';
import type { MetaItemDef as ItemDef } from '@org/shared';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { RawResponse } from '../components/RawResponse';

export function ItemDefDetailPage() {
  const { defId } = useParams<{ defId: string }>();
  const [item, setItem] = useState<ItemDef | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!defId) return;
    contentApi.getItemDef(defId)
      .then(setItem)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [defId]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page">
      <p><Link to="/content/items">← Back to Items</Link></p>
      <h1>{item?.name ?? defId}</h1>
      <ErrorMessage error={error} />
      {item && (
        <dl className="details">
          <dt>ID</dt><dd>{item.defId}</dd>
          <dt>Description</dt><dd>{item.description}</dd>
          <dt>Category</dt><dd>{item.category}</dd>
          <dt>Rarity</dt><dd>{item.rarity}</dd>
          <dt>Stackable</dt><dd>{item.stackable ? `Yes (max ${item.maxStack})` : 'No'}</dd>
          <dt>Tradeable</dt><dd>{item.tradeable ? 'Yes' : 'No'}</dd>
          <dt>Effects</dt><dd><code>{JSON.stringify(item.effects)}</code></dd>
        </dl>
      )}
      <RawResponse data={item} />
    </div>
  );
}
