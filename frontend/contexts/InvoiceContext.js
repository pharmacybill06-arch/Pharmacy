import React, { createContext, useState, useCallback } from 'react';

export const InvoiceContext = createContext();

export const InvoiceProvider = ({ children }) => {
  const [currentInvoice, setCurrentInvoice] = useState({
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    paymentType: 'cash',
    items: [],
    subtotal: 0,
    cgst: 0,
    sgst: 0,
    totalGst: 0,
    discountAmount: 0,
    roundOff: 0,
    grandTotal: 0,
    amountPaid: 0,
    remarks: ''
  });

  const [invoiceList, setInvoiceList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Add item to invoice
  const addItem = useCallback((item) => {
    setCurrentInvoice((prev) => ({
      ...prev,
      items: [...prev.items, item]
    }));
  }, []);

  // Remove item from invoice
  const removeItem = useCallback((index) => {
    setCurrentInvoice((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  }, []);

  // Update item
  const updateItem = useCallback((index, updatedItem) => {
    setCurrentInvoice((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? updatedItem : item))
    }));
  }, []);

  // Update invoice totals
  const updateTotals = useCallback((subtotal, cgst = 0, sgst = 0, discountAmount = 0, roundOff = 0) => {
    const totalGst = cgst + sgst;
    const grandTotal = subtotal + totalGst - discountAmount + roundOff;
    const amountPaid = grandTotal; // Default to full amount

    setCurrentInvoice((prev) => ({
      ...prev,
      subtotal,
      cgst,
      sgst,
      totalGst,
      discountAmount,
      roundOff,
      grandTotal,
      amountPaid
    }));
  }, []);

  // Update customer details
  const updateCustomer = useCallback((customerName, customerPhone, customerAddress) => {
    setCurrentInvoice((prev) => ({
      ...prev,
      customerName,
      customerPhone,
      customerAddress
    }));
  }, []);

  // Update payment details
  const updatePayment = useCallback((paymentType, amountPaid) => {
    setCurrentInvoice((prev) => ({
      ...prev,
      paymentType,
      amountPaid: amountPaid || prev.grandTotal
    }));
  }, []);

  // Reset invoice
  const resetInvoice = useCallback(() => {
    setCurrentInvoice({
      customerName: '',
      customerPhone: '',
      customerAddress: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      paymentType: 'cash',
      items: [],
      subtotal: 0,
      cgst: 0,
      sgst: 0,
      totalGst: 0,
      discountAmount: 0,
      roundOff: 0,
      grandTotal: 0,
      amountPaid: 0,
      remarks: ''
    });
    setError(null);
  }, []);

  // Fetch invoices
  const fetchInvoices = useCallback(async (userId, apiUrl) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/invoices/${userId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch invoices');
      }

      const data = await response.json();
      setInvoiceList(data.invoices || []);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Create invoice
  const createInvoice = useCallback(async (userId, apiUrl) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/invoices/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentInvoice)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create invoice');
      }

      const data = await response.json();
      resetInvoice();
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentInvoice, resetInvoice]);

  // Get invoice by ID
  const getInvoice = useCallback(async (userId, invoiceId, apiUrl) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/invoices/${userId}/${invoiceId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch invoice');
      }

      const data = await response.json();
      return data.invoice;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete invoice (reversal)
  const deleteInvoice = useCallback(async (userId, invoiceId, apiUrl) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/invoices/${userId}/${invoiceId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to delete invoice');
      }

      const data = await response.json();
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = {
    currentInvoice,
    invoiceList,
    loading,
    error,
    addItem,
    removeItem,
    updateItem,
    updateTotals,
    updateCustomer,
    updatePayment,
    resetInvoice,
    fetchInvoices,
    createInvoice,
    getInvoice,
    deleteInvoice
  };

  return (
    <InvoiceContext.Provider value={value}>
      {children}
    </InvoiceContext.Provider>
  );
};

export const useInvoice = () => {
  const context = React.useContext(InvoiceContext);
  if (!context) {
    throw new Error('useInvoice must be used within InvoiceProvider');
  }
  return context;
};
