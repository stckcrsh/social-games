import { Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header';

export function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/inventory" replace />} />
          {/* Routes for pages added in Tasks 4-8 */}
        </Routes>
      </main>
    </>
  );
}
