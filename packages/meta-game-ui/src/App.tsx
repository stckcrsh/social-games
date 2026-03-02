import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { RequireAdmin } from './auth/RequireAdmin';
import { Header } from './components/Header';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AccountPage } from './pages/AccountPage';
import { ItemDefsPage } from './pages/ItemDefsPage';
import { ItemDefDetailPage } from './pages/ItemDefDetailPage';
import { ShopPage } from './pages/ShopPage';
import { InventoryPage } from './pages/InventoryPage';
import { AdminPage } from './pages/AdminPage';
import { TradesPage } from './pages/TradesPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Header />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/content/items" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/content/items" element={<ItemDefsPage />} />
            <Route path="/content/items/:defId" element={<ItemDefDetailPage />} />
            <Route path="/shop" element={<ShopPage />} />
            <Route
              path="/account"
              element={<RequireAuth><AccountPage /></RequireAuth>}
            />
            <Route
              path="/inventory"
              element={<RequireAuth><InventoryPage /></RequireAuth>}
            />
            <Route
              path="/trades"
              element={<RequireAuth><TradesPage /></RequireAuth>}
            />
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <RequireAdmin><AdminPage /></RequireAdmin>
                </RequireAuth>
              }
            />
          </Routes>
        </main>
      </AuthProvider>
    </BrowserRouter>
  );
}
