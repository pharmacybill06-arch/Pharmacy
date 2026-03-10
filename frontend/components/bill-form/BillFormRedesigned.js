import React, { useEffect, useState } from 'react';
import { View, Modal, StyleSheet } from 'react-native';
import BillFormScreen from '@/components/screens/BillFormScreen';
import Toast from '@/components/ui/Toast';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ItemRowEditor from './ItemRowEditor';
import DistributorFormScreen from '@/components/screens/DistributorFormScreen';
import { distributorApi, gstinApi } from '@/services/api';
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
  onSaveDraft,
  onCancel,
  initialData,
}) {
  const { user } = useAuth();
  const userId = user?.id;
  const userShopName = user?.shopName || '';

  console.log('[BillFormRedesigned] User shop name:', JSON.stringify(userShopName), '| User object keys:', user ? Object.keys(user) : 'null');
  console.log('[BillFormRedesigned] User full:', JSON.stringify({ id: user?.id, name: user?.name, shopName: user?.shopName, shop: user?.shop }));

  // Helper: check if a string matches the user's shop name (fuzzy)
  const isUserShopName = (text) => {
    if (!text) return false;
    // Collect all names that belong to the user
    const shopNames = [userShopName, user?.name].filter(Boolean);
    if (shopNames.length === 0) return false;

    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const textNorm = normalize(text);
    if (!textNorm) return false;

    for (const shopName of shopNames) {
      const shopNorm = normalize(shopName);
      if (!shopNorm) continue;

      // Exact match
      if (shopNorm === textNorm) {
        console.log(`[ShopNameFilter] EXACT MATCH: "${text}" == user's "${shopName}"`);
        return true;
      }
      // One contains the other (only if the shorter one is at least 4 chars to avoid false positives)
      const shorter = shopNorm.length < textNorm.length ? shopNorm : textNorm;
      const longer = shopNorm.length < textNorm.length ? textNorm : shopNorm;
      if (shorter.length >= 4 && longer.includes(shorter)) {
        console.log(`[ShopNameFilter] CONTAINS MATCH: "${text}" ~ user's "${shopName}"`);
        return true;
      }
      // Word overlap: if >50% of the words in shopName appear in the text
      const shopWords = shopNorm.split(/\s+/).filter(w => w.length >= 3);
      const textWords = textNorm.split(/\s+/).filter(w => w.length >= 3);
      if (shopWords.length > 0) {
        const matchCount = shopWords.filter(w => textWords.includes(w) || textNorm.includes(w)).length;
        if (matchCount > 0 && matchCount >= Math.ceil(shopWords.length * 0.5)) {
          console.log(`[ShopNameFilter] WORD MATCH (${matchCount}/${shopWords.length}): "${text}" ~ user's "${shopName}"`);
          return true;
        }
      }
    }
    return false;
  };

  // Filter out user's own shop name from parsed OCR data
  const filterShopNameFromData = (data) => {
    const filtered = { ...data };
    // Clear pharmacyName if it matches the user's shop
    if (isUserShopName(filtered.pharmacyName)) {
      console.log('[BillFormRedesigned] Filtered out user shop name from pharmacyName:', filtered.pharmacyName);
      filtered.pharmacyName = '';
    }
    // Also clear distributor name if it matches the user's shop
    if (filtered.distributor && isUserShopName(filtered.distributor?.name)) {
      console.log('[BillFormRedesigned] Filtered out user shop name from distributor:', filtered.distributor.name);
      filtered.distributor = { ...filtered.distributor, name: '' };
    }
    return filtered;
  };

  // Filter initial pharmacyName if it matches the user's own shop
  const initPharmacyName = initialData?.pharmacyName || '';
  const filteredInitPharmacyName = isUserShopName(initPharmacyName) ? '' : initPharmacyName;

  const [formData, setFormData] = useState({
    pharmacyName: filteredInitPharmacyName,
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
    cgstPercent: initialData?.cgstPercent || 0,
    sgst: initialData?.sgst || 0,
    sgstPercent: initialData?.sgstPercent || 0,
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
  const [distributorSearchQuery, setDistributorSearchQuery] = useState(
    isUserShopName(initialData?.pharmacyName) ? '' : (initialData?.pharmacyName || '')
  );
  const [showAddDistributorModal, setShowAddDistributorModal] = useState(false);
  const [newDistributorName, setNewDistributorName] = useState('');
  
  // Distributor mode: 'search' (name autocomplete) or 'gst' (GST number lookup)
  const [distributorMode, setDistributorMode] = useState('search');

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
    // If initialData already has items (e.g. from CSV/Excel import), skip Gemini parsing
    if (initialData && initialData.items && initialData.items.length > 0) {
      console.log('[BillFormRedesigned] Using pre-parsed initialData (CSV/Excel or edit mode), skipping Gemini');
      // Still filter out the user's own shop name from pre-parsed data
      const filteredData = filterShopNameFromData(initialData);
      if (filteredData.pharmacyName !== initialData.pharmacyName) {
        setFormData((prev) => ({ ...prev, pharmacyName: filteredData.pharmacyName }));
        setDistributorSearchQuery(filteredData.pharmacyName);
      }
      return;
    }

    if (!ocrText || ocrText.trim().length === 0) {
      console.log('[BillFormRedesigned] No OCR text provided, skipping Gemini parsing');
      return;
    }

    const parseOcrWithGeminiIntegration = async () => {
      try {
        console.log(`[BillFormRedesigned] Starting Gemini parsing - OCR text length: ${ocrText.length} characters`);
        setGeminiLoading(true);
        setGeminiError(null);

        const parsedData = await parseOcrWithGemini(ocrText);
        const formattedData = formatParsedDataForForm(parsedData);
        // Filter out the user's own shop name from extracted data
        const filteredData = filterShopNameFromData(formattedData);
        const confidence = calculateParseConfidence(parsedData);
        const reviewItems = getItemsNeedingReview(filteredData.items);

        setGeminiConfidence(confidence);
        setItemsNeedingManualReview(reviewItems.length);

        // Update distributor search query with filtered name
        setDistributorSearchQuery(filteredData.pharmacyName || '');

        setFormData((prev) => ({
          ...prev,
          ...filteredData,
          items: filteredData.items,
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
      // Always calculate: Qty × Rate - Discount for consistency
      const quantity = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      const itemDiscount = Number(item.discount) || 0;
      const itemTotal = quantity * rate - itemDiscount;
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

  // GST Lookup handlers
  const handleGstLookupDistributorFound = async (distributorData) => {
    if (!distributorData) return;

    const { name, gstin, address, phone, dlNumber, email } = distributorData;
    
    // Try to find existing distributor with this GSTIN first
    if (userId && gstin) {
      try {
        const searchResult = await distributorApi.searchDistributors(userId, gstin);
        const existingDistributors = searchResult?.distributors || [];
        
        if (existingDistributors.length > 0) {
          // Found existing distributor with this GSTIN - select it
          const existing = existingDistributors[0];
          setSelectedDistributor(existing);
          setDistributorSearchQuery(existing.name);
          setFormData((prev) => ({
            ...prev,
            distributorId: existing.id,
            pharmacyName: existing.name,
            gstin: existing.gstin || gstin,
            phoneNumbers: existing.phone || phone || '',
            shopAddress: existing.address || address || '',
            dlNumber: existing.dlNumber || dlNumber || '',
          }));
          showToast(`Existing distributor "${existing.name}" matched by GSTIN`, 'success', 'Distributor Found');
          return;
        }
      } catch (err) {
        console.log('[GST Lookup] Search for existing distributor failed, will create new:', err.message);
      }
    }

    // No existing distributor found - create virtual selection from API data
    const gstDistributor = {
      id: null, // Will be created when bill is saved
      name: name || '',
      gstin: gstin || '',
      address: address || '',
      phone: phone || '',
      dlNumber: dlNumber || '',
      email: email || '',
      _fromGstLookup: true, // Flag to indicate this came from GST lookup
    };

    setSelectedDistributor(gstDistributor);
    setDistributorSearchQuery(gstDistributor.name);
    setFormData((prev) => ({
      ...prev,
      pharmacyName: gstDistributor.name,
      gstin: gstDistributor.gstin,
      shopAddress: gstDistributor.address,
      phoneNumbers: gstDistributor.phone,
      dlNumber: gstDistributor.dlNumber,
    }));

    showToast(`Distributor info loaded from GST: ${gstDistributor.name}`, 'success', 'GST Lookup');
  };

  const handleGstLookupError = (errorMsg) => {
    showToast(errorMsg || 'GST lookup failed', 'error', 'Lookup Failed');
  };

  const handleDistributorModeChange = (mode) => {
    setDistributorMode(mode);
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

  const handleSaveDraft = () => {
    if (onSaveDraft) {
      onSaveDraft(formData);
    }
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
        onSaveDraft={onSaveDraft ? handleSaveDraft : undefined}
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
        // GST Lookup props
        onGstLookupDistributorFound={handleGstLookupDistributorFound}
        onGstLookupError={handleGstLookupError}
        distributorMode={distributorMode}
        onDistributorModeChange={handleDistributorModeChange}
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