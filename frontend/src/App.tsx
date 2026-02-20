import { Route, Routes } from 'react-router'

import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Documents from './pages/Documents'
import Inbox from './pages/Inbox'
import Parties from './pages/Parties'
import PartyDetail from './pages/PartyDetail'
import Reports from './pages/Reports'
import ReviewQueue from './pages/ReviewQueue'
import Settings from './pages/Settings'
import TransactionDetail from './pages/TransactionDetail'
import Transactions from './pages/Transactions'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="transactions/:transactionId" element={<TransactionDetail />} />
        <Route path="documents" element={<Documents />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="review" element={<ReviewQueue />} />
        <Route path="parties" element={<Parties />} />
        <Route path="parties/:partyId" element={<PartyDetail />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
