import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { setUnauthenticatedHandler } from './lib/api';
import { queryClient } from './lib/queries';
import { useMe } from './hooks/useAuth';
import { Shell } from './components/Shell';
import { LoginScreen } from './screens/LoginScreen';
import { SummaryScreen } from './screens/SummaryScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { BudgetScreen } from './screens/BudgetScreen';
import { SavingsScreen } from './screens/SavingsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export function App() {
  const navigate = useNavigate();
  const me = useMe();

  useEffect(() => {
    // A token expiring mid-session must not leave one household's data on screen.
    setUnauthenticatedHandler(() => {
      queryClient.clear();
      navigate('/login', { replace: true });
    });
  }, [navigate]);

  if (me.isLoading) {
    return (
      <div className="app">
        <div className="splash">Household Ledger…</div>
      </div>
    );
  }

  if (!me.data) {
    return (
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Shell>
      <Routes>
        <Route path="/login" element={<Navigate to="/summary" replace />} />
        <Route path="/summary" element={<SummaryScreen />} />
        <Route path="/transactions" element={<TransactionsScreen />} />
        <Route path="/budget" element={<BudgetScreen />} />
        <Route path="/savings" element={<SavingsScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/summary" replace />} />
      </Routes>
    </Shell>
  );
}
