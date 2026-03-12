import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { WrestlerDashboard } from './views/WrestlerDashboard.js';
import { SubmissionForm } from './views/SubmissionForm.js';
import { BettingList } from './views/BettingList.js';
import { CreateProposition } from './views/CreateProposition.js';
import { PropositionDetail } from './views/PropositionDetail.js';

export default function App() {
  return (
    <BrowserRouter>
      <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', gap: '1rem' }}>
        <strong>Wrastlin</strong>
        <Link to="/">My Wrestler</Link>
        <Link to="/submit">Weekly Submission</Link>
        <Link to="/bets">Bets</Link>
      </nav>
      <Routes>
        <Route path="/" element={<WrestlerDashboard />} />
        <Route path="/submit" element={<SubmissionForm />} />
        <Route path="/bets" element={<BettingList />} />
        <Route path="/bets/new" element={<CreateProposition />} />
        <Route path="/bets/:id" element={<PropositionDetail />} />
      </Routes>
    </BrowserRouter>
  );
}
