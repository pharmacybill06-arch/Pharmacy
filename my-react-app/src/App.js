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
