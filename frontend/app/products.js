import React, { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import ProductsListScreen from '@/components/screens/ProductsListScreen';
import ProductFormScreen from '@/components/screens/ProductFormScreen';

/**
 * Products Screen
 * Manages product catalog with list and form views
 */
export default function ProductsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState('list'); // 'list' | 'form'
  const [selectedProduct, setSelectedProduct] = useState(null);

  const userId = user?.id;

  // Navigate back to main screen
  const handleBack = useCallback(() => {
    if (currentView === 'form') {
      setCurrentView('list');
      setSelectedProduct(null);
    } else {
      router.back();
    }
  }, [currentView, router]);

  // Open product form for editing
  const handleProductPress = useCallback((product) => {
    setSelectedProduct(product);
    setCurrentView('form');
  }, []);

  // Open product form for creating
  const handleAddPress = useCallback(() => {
    setSelectedProduct(null);
    setCurrentView('form');
  }, []);

  // Handle product saved
  const handleProductSaved = useCallback((product) => {
    setCurrentView('list');
    setSelectedProduct(null);
  }, []);

  // Sell this product straight from its row in the list
  const handleSellPress = useCallback(() => {
    router.push('/sales?view=sell');
  }, [router]);

  // Render based on current view
  if (currentView === 'form') {
    return (
      <ProductFormScreen
        userId={userId}
        product={selectedProduct}
        onBack={handleBack}
        onSave={handleProductSaved}
      />
    );
  }

  return (
    <ProductsListScreen
      userId={userId}
      onBack={handleBack}
      onProductPress={handleProductPress}
      onAddPress={handleAddPress}
      onSellPress={handleSellPress}
    />
  );
}
