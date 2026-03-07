import { Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header';
import { RequireAuth } from './components/RequireAuth';
import { RequireAdmin } from './components/RequireAdmin';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { InventoryPage } from './pages/InventoryPage';
import { ShopPage } from './pages/ShopPage';
import { TradesPage } from './pages/TradesPage';
import { AccountPage } from './pages/AccountPage';
import { AdminPage } from './pages/AdminPage';
import { ItemDefsPage } from './pages/ItemDefsPage';
import { ItemDefDetailPage } from './pages/ItemDefDetailPage';
import { GamePage } from './game/Game';

export function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/inventory" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/inventory" element={<RequireAuth><InventoryPage /></RequireAuth>} />
          <Route path="/shop" element={<RequireAuth><ShopPage /></RequireAuth>} />
          <Route path="/trades" element={<RequireAuth><TradesPage /></RequireAuth>} />
          <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
          <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
          <Route path="/content/items" element={<ItemDefsPage />} />
          <Route path="/content/items/:defId" element={<ItemDefDetailPage />} />
          <Route path="/game/:runId" element={<RequireAuth><GamePage /></RequireAuth>} />
          {/* /loadout, /results/:runId, /debug added in Tasks 6-8 */}
        </Routes>
      </main>
    </>
  );
}
