import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.js';
import { RequireAuth } from './components/RequireAuth.js';
import { LoginView } from './views/LoginView.js';
import { WrestlerDashboard } from './views/WrestlerDashboard.js';
import { SubmissionForm } from './views/SubmissionForm.js';
import { BettingList } from './views/BettingList.js';
import { CreateProposition } from './views/CreateProposition.js';
import { PropositionDetail } from './views/PropositionDetail.js';

function NavBar() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();
  function handleLogout() {
    logout();
    navigate('/login');
  }
  return (
    <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', gap: '1rem', alignItems: 'center' }}>
      <strong>Wrastlin</strong>
      <Link to="/">My Wrestler</Link>
      <Link to="/submit">Weekly Submission</Link>
      <Link to="/bets">Bets</Link>
      <span style={{ marginLeft: 'auto', color: 'gray', fontSize: '0.875rem' }}>{username}</span>
      <button onClick={handleLogout} style={{ fontSize: '0.875rem' }}>Log out</button>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="/*" element={
            <RequireAuth>
              <NavBar />
              <Routes>
                <Route path="/" element={<WrestlerDashboard />} />
                <Route path="/submit" element={<SubmissionForm />} />
                <Route path="/bets" element={<BettingList />} />
                <Route path="/bets/new" element={<CreateProposition />} />
                <Route path="/bets/:id" element={<PropositionDetail />} />
              </Routes>
            </RequireAuth>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
