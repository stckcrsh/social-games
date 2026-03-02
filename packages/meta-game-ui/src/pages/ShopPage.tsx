import { useState, useEffect } from 'react';
import { shopApi, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { ShopOffer } from '../types/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { RawResponse } from '../components/RawResponse';

export function ShopPage() {
  const [offers, setOffers] = useState<ShopOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [purchaseResult, setPurchaseResult] = useState<unknown>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    shopApi.listOffers()
      .then(setOffers)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  async function handlePurchase(offerId: string) {
    const idempotencyKey = crypto.randomUUID();
    setPurchasing(offerId);
    setPurchaseResult(null);
    try {
      const result = await shopApi.purchase({ offerId, idempotencyKey });
      setPurchaseResult(result);
    } catch (err) {
      setPurchaseResult(err instanceof ApiError ? err.body : { error: String(err) });
    } finally {
      setPurchasing(null);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page">
      <h1>Shop</h1>
      <ErrorMessage error={error} />
      {offers.length === 0 && !error && <p>No offers available.</p>}
      {offers.map(offer => (
        <div key={offer.offerId} className="card">
          <h3>{offer.title}</h3>
          <p>{offer.description}</p>
          <p>
            <strong>Stock:</strong>{' '}
            {typeof offer.stock === 'string'
              ? offer.stock
              : `limited (${offer.stock.remaining} remaining)`}
          </p>
          <p>
            <strong>Price:</strong>{' '}
            {offer.price.length > 0
              ? offer.price.map(p => `${p.qty}× ${p.defId}`).join(', ')
              : 'Free'}
          </p>
          {token ? (
            <button
              onClick={() => handlePurchase(offer.offerId)}
              disabled={purchasing === offer.offerId}
            >
              {purchasing === offer.offerId ? 'Purchasing...' : 'Purchase'}
            </button>
          ) : (
            <p><em>Login to purchase</em></p>
          )}
        </div>
      ))}
      {purchaseResult !== null && (
        <>
          <h2>Purchase Result</h2>
          <RawResponse data={purchaseResult} />
        </>
      )}
    </div>
  );
}
