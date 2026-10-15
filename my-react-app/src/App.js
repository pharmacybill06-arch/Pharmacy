import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ScanBillPage from './pages/ScanBillPage';
import BillFormPage from './pages/BillFormPage';
import BillsListPage from './pages/BillsListPage';
import BillDetailsPage from './pages/BillDetailsPage';
import ProductsPage from './pages/ProductsPage';
import ProductFormPage from './pages/ProductFormPage';
import DistributorsPage from './pages/DistributorsPage';
import DistributorFormPage from './pages/DistributorFormPage';
import DistributorDetailPage from './pages/DistributorDetailPage';
import InvoicesPage from './pages/InvoicesPage';
import CreateInvoicePage from './pages/CreateInvoicePage';
import DraftsPage from './pages/DraftsPage';
import InventoryPage from './pages/InventoryPage';
import ProfilePage from './pages/ProfilePage';
import EmailBillsPage from './pages/EmailBillsPage';
import LedgerPage from './pages/LedgerPage';
import LedgerDetailPage from './pages/LedgerDetailPage';
import PaymentFormPage from './pages/PaymentFormPage';
import PaymentsPage from './pages/PaymentsPage';
import ExpiryPage from './pages/ExpiryPage';
import SalesPage from './pages/SalesPage';
import QuickSellPage from './pages/QuickSellPage';
import PatientsPage from './pages/PatientsPage';
import PatientFormPage from './pages/PatientFormPage';
import PatientDetailPage from './pages/PatientDetailPage';
import ExportsPage from './pages/ExportsPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="loading-spinner" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }
  return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-spinner" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="scan" element={<ScanBillPage />} />
        <Route path="email-bills" element={<EmailBillsPage />} />
        <Route path="bill-form" element={<BillFormPage />} />
        <Route path="bills" element={<BillsListPage />} />
        <Route path="bills/:billId" element={<BillDetailsPage />} />
        <Route path="drafts" element={<DraftsPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/new" element={<ProductFormPage />} />
        <Route path="products/:productId/edit" element={<ProductFormPage />} />
        <Route path="distributors" element={<DistributorsPage />} />
        <Route path="distributors/new" element={<DistributorFormPage />} />
        <Route path="distributors/:distributorId" element={<DistributorDetailPage />} />
        <Route path="distributors/:distributorId/edit" element={<DistributorFormPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/create" element={<CreateInvoicePage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="ledger" element={<LedgerPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="expiry" element={<ExpiryPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="sales/new" element={<QuickSellPage />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="patients/new" element={<PatientFormPage />} />
        <Route path="patients/:patientId" element={<PatientDetailPage />} />
        <Route path="patients/:patientId/edit" element={<PatientFormPage />} />
        <Route path="exports" element={<ExportsPage />} />
        <Route path="ledger/:distributorId" element={<LedgerDetailPage />} />
        <Route path="ledger/:distributorId/pay" element={<PaymentFormPage />} />
        <Route path="ledger/:distributorId/payments/:paymentId" element={<PaymentFormPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
