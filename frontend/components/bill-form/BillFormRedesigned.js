import React, { useEffect, useState } from 'react';
import { View, Modal, StyleSheet } from 'react-native';
import BillFormScreen from '@/components/screens/BillFormScreen';
import Toast from '@/components/ui/Toast';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ItemRowEditor from './ItemRowEditor';
import DistributorFormScreen from '@/components/screens/DistributorFormScreen';
import { distributorApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  calculateParseConfidence,
  formatParsedDataForForm,
  getItemsNeedingReview,
  parseOcrWithGemini,
} from './gemini-integration';

/**
 * BillFormRedesigned Component
 * This is a wrapper that maintains all existing BillForm logic
 * but uses the new redesigned UI from BillFormScreen
 * 
 * USAGE: Replace BillForm import with this component
 * import BillFormRedesigned from '@/components/bill-form/BillFormRedesigned';
 */
export default function BillFormRedesigned({
  ocrText,
  onSubmit,
  onCancel,
  initialData,
}) {
  const { user } = useAuth();
  const userId = user?.id;

  const [formData, setFormData] = useState({
    pharmacyName: initialData?.pharmacyName || '',
    shopAddress: initialData?.shopAddress || '',
    phoneNumbers: initialData?.phoneNumbers || '',
    gstin: initialData?.gstin || '',
    dlNumber: initialData?.dlNumber || '',
    distributorId: initialData?.distributorId || null,
    invoiceNumber: initialData?.invoiceNumber || '',
    invoiceDate: initialData?.invoiceDate || '',
    dueDate: initialData?.dueDate || '',
    paymentType: initialData?.paymentType || 'cash',
    currentBalance: initialData?.currentBalance || 0,
    items: initialData?.items || [],
    subtotal: initialData?.subtotal || 0,
    discountPercent: initialData?.discountPercent || 0, // Changed from discount to discountPercent
    discount: initialData?.discount || 0, // Keep calculated discount amount
    cgst: initialData?.cgst || 0,
    sgst: initialData?.sgst || 0,
    totalGst: initialData?.totalGst || 0,
    roundOff: initialData?.roundOff || 0,
    grandTotal: initialData?.grandTotal || 0,
  });

  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState(null);
  const [geminiConfidence, setGeminiConfidence] = useState(null);
  const [itemsNeedingManualReview, setItemsNeedingManualReview] = useState(0);
  const [editingItemIndex, setEditingItemIndex] = useState(null);

  // Distributor state
  const [selectedDistributor, setSelectedDistributor] = useState(initialData?.distributor || null);
  const [distributorSearchQuery, setDistributorSearchQuery] = useState(initialData?.pharmacyName || '');
  const [showAddDistributorModal, setShowAddDistributorModal] = useState(false);
  const [newDistributorName, setNewDistributorName] = useState('');

  // Toast state
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info', title: '' });

  // Confirm dialog state for item removal
  const [removeDialog, setRemoveDialog] = useState({ visible: false, itemIndex: null });

  const showToast = (message, type = 'info', title = '') => {
    setToast({ visible: true, message, type, title });
  };

  const hideToast = () => {
    setToast({ ...toast, visible: false });
  };

  // Calculate totals whenever items or tax fields change
  useEffect(() => {
    calculateTotals();
  }, [formData.items, formData.discountPercent, formData.cgst, formData.sgst, formData.roundOff]);

  // Parse OCR text with Gemini when provided
  useEffect(() => {
    if (!ocrText || ocrText.trim().length === 0) {
      console.log('[BillFormRedesigned] No OCR text provided, skipping Gemini parsing');
      // If initialData is already provided, don't parse again
      if (initialData && Object.keys(initialData).length > 0) {
        console.log('[BillFormRedesigned] Using pre-parsed initialData from OCR Review screen');
      }
      return;
    }

    const parseOcrWithGeminiIntegration = async () => {
      try {
        console.log(`[BillFormRedesigned] Starting Gemini parsing - OCR text length: ${ocrText.length} characters`);
        setGeminiLoading(true);
        setGeminiError(null);

        const parsedData = await parseOcrWithGemini(ocrText);
        const formattedData = formatParsedDataForForm(parsedData);
        const confidence = calculateParseConfidence(parsedData);
        const reviewItems = getItemsNeedingReview(formattedData.items);

        setGeminiConfidence(confidence);
        setItemsNeedingManualReview(reviewItems.length);

        setFormData((prev) => ({
          ...prev,
          ...formattedData,
          items: formattedData.items,
        }));

        console.log('[BillFormRedesigned] Gemini parsing successful. Items:', formattedData.items.length);

        setGeminiLoading(false);
        
        // Show success toast
        showToast(
          `${(confidence * 100).toFixed(0)}% confidence • ${formattedData.items.length} items found${reviewItems.length > 0 ? ` • ${reviewItems.length} need review` : ''}`,
          'success',
          'AI Parse Complete'
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('[BillFormRedesigned] Gemini parsing failed:', errorMessage, error);
        setGeminiError(errorMessage);
        setGeminiLoading(false);

        // Show error toast
        showToast(
          'Failed to parse invoice. You can still edit manually.',
          'error',
          'AI Parse Failed'
        );
      }
    };

    parseOcrWithGeminiIntegration();
  }, [ocrText]);

  const calculateTotals = () => {
    // Skip calculation if we have no items
    if (!formData.items || formData.items.length === 0) {
      return;
    }

    // Calculate subtotal as sum of all item totals
    let subtotal = 0;

    formData.items.forEach((item) => {
      // Use stored itemTotal or calculate: Qty × Rate - Discount
      let itemTotal = 0;
      if (item.itemTotal !== undefined && item.itemTotal !== null && item.itemTotal > 0) {
        itemTotal = item.itemTotal;
      } else {
        const quantity = Number(item.quantity) || 0;
        const rate = Number(item.rate) || 0;
        const itemDiscount = Number(item.discount) || 0;
        itemTotal = quantity * rate - itemDiscount;
      }
      subtotal += itemTotal;
    });

    subtotal = Math.round(subtotal * 100) / 100;

    // Calculate discount amount from percentage
    const discountPercent = Number(formData.discountPercent) || 0;
    const discountAmount = (subtotal * discountPercent) / 100;

    // Get user-entered values (editable)
    const cgst = Number(formData.cgst) || 0;
    const sgst = Number(formData.sgst) || 0;
    const roundOff = Number(formData.roundOff) || 0;

    // Calculate grand total: Subtotal - Discount + CGST + SGST + RoundOff
    const totalGst = cgst + sgst;
    const grandTotal = subtotal - discountAmount + cgst + sgst + roundOff;

    setFormData((prev) => ({
      ...prev,
      subtotal: subtotal,
      discount: Math.round(discountAmount * 100) / 100, // Store calculated discount amount
      totalGst: Math.round(totalGst * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
    }));
  };

  const updatePharmacyDetails = (details) => {
    setFormData((prev) => ({ ...prev, ...details }));
  };

  const updateInvoiceMetadata = (metadata) => {
    setFormData((prev) => ({ ...prev, ...metadata }));
  };

  const updateItems = (items) => {
    setFormData((prev) => ({ ...prev, items }));
  };

  const updateRoundOff = (roundOff) => {
    setFormData((prev) => ({ ...prev, roundOff }));
  };

  // Distributor handlers
  const handleDistributorSearchChange = (text) => {
    setDistributorSearchQuery(text);
    // Also update pharmacyName for backward compatibility
    setFormData((prev) => ({ ...prev, pharmacyName: text }));
  };

  const handleDistributorSelect = (distributor) => {
    setSelectedDistributor(distributor);
    if (distributor) {
      setDistributorSearchQuery(distributor.name);
      setFormData((prev) => ({
        ...prev,
        distributorId: distributor.id,
        pharmacyName: distributor.name,
        gstin: distributor.gstin || prev.gstin,
        phoneNumbers: distributor.phone || prev.phoneNumbers,
        shopAddress: distributor.address || prev.shopAddress,
        dlNumber: distributor.dlNumber || prev.dlNumber,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        distributorId: null,
      }));
    }
  };

  const handleAddNewDistributor = (name) => {
    setNewDistributorName(name);
    setShowAddDistributorModal(true);
  };

  const handleDistributorCreated = async (distributorData) => {
    if (!distributorData || !userId) {
      setShowAddDistributorModal(false);
      return;
    }
    
    try {
      // Create the distributor via API
      const response = await distributorApi.createDistributor(userId, distributorData);
      
      if (response.success && response.data) {
        const newDistributor = response.data;
        setShowAddDistributorModal(false);
        setSelectedDistributor(newDistributor);
        setDistributorSearchQuery(newDistributor.name);
        setFormData((prev) => ({
          ...prev,
          distributorId: newDistributor.id,
          pharmacyName: newDistributor.name,
          gstin: newDistributor.gstin || '',
          phoneNumbers: newDistributor.phone || '',
          shopAddress: newDistributor.address || '',
          dlNumber: newDistributor.dlNumber || '',
        }));
        showToast('Distributor created and selected', 'success', 'Success');
      } else {
        showToast(response.message || 'Failed to create distributor', 'error', 'Error');
      }
    } catch (error) {
      console.error('Error creating distributor:', error);
      showToast(error.message || 'Failed to create distributor', 'error', 'Error');
      setShowAddDistributorModal(false);
    }
  };

  const handleAddItem = () => {
    // Add a new empty item
    const newItem = {
      name: '',
      quantity: 1,
      unit: 'pcs',
      rate: 0,
      discount: 0,
      gstPercent: 0,
      itemTotal: 0,
    };
    updateItems([...formData.items, newItem]);
  };

  const handleEditItem = (index) => {
    // Set the item to be edited (inline editing mode)
    setEditingItemIndex(index);
  };

  const handleUpdateEditingItem = (updatedFields) => {
    if (editingItemIndex === null) return;
    
    const updatedItems = [...formData.items];
    updatedItems[editingItemIndex] = {
      ...updatedItems[editingItemIndex],
      ...updatedFields,
    };
    
    updateItems(updatedItems);
  };

  const handleRemoveEditingItem = () => {
    if (editingItemIndex === null) return;
    // Show confirm dialog instead of directly removing
    setRemoveDialog({ visible: true, itemIndex: editingItemIndex });
  };

  const confirmRemoveItem = () => {
    if (removeDialog.itemIndex === null) return;
    
    const updatedItems = formData.items.filter((_, index) => index !== removeDialog.itemIndex);
    updateItems(updatedItems);
    setEditingItemIndex(null);
    setRemoveDialog({ visible: false, itemIndex: null });
    
    // Show success toast
    showToast('Item has been removed from the bill', 'success', 'Item Removed');
  };

  const cancelRemoveItem = () => {
    setRemoveDialog({ visible: false, itemIndex: null });
  };

  const handleSaveEditingItem = () => {
    setEditingItemIndex(null);
  };

  const handleSubmit = () => {
    // Validation
    // if (!formData.pharmacyName.trim()) {
    //   Alert.alert('Validation Error', 'Pharmacy name is required');
    //   return;
    // }

    // if (!formData.invoiceNumber.trim()) {
    //   Alert.alert('Validation Error', 'Invoice number is required');
    //   return;
    // }

    // if (!formData.invoiceDate.trim()) {
    //   Alert.alert('Validation Error', 'Invoice date is required');
    //   return;
    // }

    // if (formData.items.length === 0) {
    //   Alert.alert('Validation Error', 'At least one item is required');
    //   return;
    // }

    const invalidItem = formData.items.find(
      (item) =>
        !item.name.trim() ||
        item.quantity <= 0 ||
        !item.unit.trim() ||
        item.rate <= 0 ||
        item.gstPercent < 0
    );

    // if (invalidItem) {
    //   Alert.alert(
    //     'Validation Error',
    //     'All items must have name, quantity, unit, rate, and GST %'
    //   );
    //   return;
    // }

    onSubmit(formData);
  };

  return (
    <View style={{ flex: 1 }}>
      <BillFormScreen
        formData={formData}
        onUpdatePharmacyDetails={updatePharmacyDetails}
        onUpdateInvoiceMetadata={updateInvoiceMetadata}
        onUpdateItems={updateItems}
        onUpdateRoundOff={updateRoundOff}
        onAddItem={handleAddItem}
        onEditItem={handleEditItem}
        onSubmit={handleSubmit}
        onCancel={onCancel}
        geminiLoading={geminiLoading}
        geminiConfidence={geminiConfidence}
        itemsNeedingManualReview={itemsNeedingManualReview}
        editingItemIndex={editingItemIndex}
        onUpdateEditingItem={handleUpdateEditingItem}
        onRemoveEditingItem={handleRemoveEditingItem}
        onSaveEditingItem={handleSaveEditingItem}
        // Distributor props
        selectedDistributor={selectedDistributor}
        distributorSearchQuery={distributorSearchQuery}
        onDistributorSearchChange={handleDistributorSearchChange}
        onDistributorSelect={handleDistributorSelect}
        onAddNewDistributor={handleAddNewDistributor}
      />

      {/* Loading Overlay for Gemini Parsing */}
      <LoadingOverlay
        visible={geminiLoading}
        message="Analyzing Invoice"
        submessage="AI is extracting data from your bill..."
        icon="sparkles"
      />

      {/* Toast Notifications */}
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        title={toast.title}
        onHide={hideToast}
        duration={4000}
      />

      {/* Confirm Dialog for Item Removal */}
      <ConfirmDialog
        visible={removeDialog.visible}
        title="Remove Item?"
        message="This item will be removed from the bill. This action cannot be undone."
        type="danger"
        confirmText="Remove"
        cancelText="Keep"
        onConfirm={confirmRemoveItem}
        onCancel={cancelRemoveItem}
      />

      {/* Add Distributor Modal */}
      <Modal
        visible={showAddDistributorModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddDistributorModal(false)}
      >
        <DistributorFormScreen
          initialData={{ name: newDistributorName }}
          onSave={handleDistributorCreated}
          onCancel={() => setShowAddDistributorModal(false)}
        />
      </Modal>
    </View>
  );
}