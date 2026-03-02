import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Keyboard,
  Modal,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useProductSearch, useProductAutofill } from '@/hooks/useProducts';

/**
 * Autocomplete Suggestion Item
 */
const SuggestionItem = React.memo(({ item, onSelect, isSelected }) => (
  <Pressable
    style={[styles.suggestionItem, isSelected && styles.suggestionItemSelected]}
    onPress={() => onSelect(item)}
  >
    <View style={styles.suggestionContent}>
      <ThemedText style={styles.suggestionName} numberOfLines={1}>
        {item.name}
      </ThemedText>
      {item.manufacturer && (
        <ThemedText style={styles.suggestionManufacturer} numberOfLines={1}>
          {item.manufacturer}
        </ThemedText>
      )}
    </View>
    <View style={styles.suggestionPrice}>
      {item.defaultRate && (
        <ThemedText style={styles.suggestionRate}>₹{item.defaultRate}</ThemedText>
      )}
      {item.usageCount > 0 && (
        <View style={styles.usageBadge}>
          <ThemedText style={styles.usageText}>{item.usageCount}×</ThemedText>
        </View>
      )}
    </View>
  </Pressable>
));

SuggestionItem.displayName = 'SuggestionItem';

/**
 * ProductAutocomplete Component
 * Shows product suggestions while typing
 */
export default function ProductAutocomplete({
  userId,
  value,
  onChangeText,
  onProductSelect,
  placeholder = 'Enter product name',
  style,
  inputStyle,
  disabled = false,
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);
  
  const {
    query,
    results,
    isSearching,
    search,
    clearSearch,
  } = useProductSearch(userId, {
    debounceMs: 200,
    minChars: 2,
    maxResults: 8,
  });

  const { autofillFromProduct } = useProductAutofill();

  // Sync external value with internal query
  useEffect(() => {
    if (value !== query) {
      search(value);
    }
  }, [value]);

  // Show/hide suggestions based on results
  useEffect(() => {
    if (results.length > 0 && query.length >= 2) {
      setShowSuggestions(true);
      setSelectedIndex(-1);
    } else {
      setShowSuggestions(false);
    }
  }, [results, query]);

  const handleTextChange = useCallback((text) => {
    onChangeText?.(text);
    search(text);
  }, [onChangeText, search]);

  const handleProductSelect = useCallback((product) => {
    const autofillData = autofillFromProduct(product);
    
    // Update the text field with product name
    onChangeText?.(product.name);
    
    // Notify parent about selection with autofill data
    onProductSelect?.(product, autofillData);
    
    // Hide suggestions and clear search
    setShowSuggestions(false);
    clearSearch();
    
    // Dismiss keyboard
    Keyboard.dismiss();
  }, [onChangeText, onProductSelect, autofillFromProduct, clearSearch]);

  const handleFocus = useCallback(() => {
    if (results.length > 0 && value?.length >= 2) {
      setShowSuggestions(true);
    }
  }, [results, value]);

  const handleBlur = useCallback(() => {
    // Delay hiding to allow tap on suggestion
    setTimeout(() => {
      setShowSuggestions(false);
    }, 200);
  }, []);

  const renderSuggestion = useCallback(({ item, index }) => (
    <SuggestionItem
      item={item}
      onSelect={handleProductSelect}
      isSelected={index === selectedIndex}
    />
  ), [handleProductSelect, selectedIndex]);

  const keyExtractor = useCallback((item) => item.id, []);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.inputContainer}>
        <TextInput
          ref={inputRef}
          style={[styles.input, inputStyle, disabled && styles.inputDisabled]}
          value={value}
          onChangeText={handleTextChange}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          onFocus={handleFocus}
          onBlur={handleBlur}
          editable={!disabled}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {isSearching && (
          <ActivityIndicator
            size="small"
            color="#64748B"
            style={styles.loader}
          />
        )}
      </View>

      {/* Suggestions Dropdown */}
      {showSuggestions && results.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <View style={styles.suggestionsHeader}>
            <Ionicons name="search" size={14} color="#64748B" />
            <ThemedText style={styles.suggestionsTitle}>
              Suggestions ({results.length})
            </ThemedText>
          </View>
          <FlatList
            data={results}
            renderItem={renderSuggestion}
            keyExtractor={keyExtractor}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.suggestionsList}
            nestedScrollEnabled
          />
        </View>
      )}
    </View>
  );
}

/**
 * ProductAutocompleteModal Component
 * Full-screen modal version for better mobile UX
 */
export function ProductAutocompleteModal({
  visible,
  onClose,
  userId,
  onProductSelect,
  initialValue = '',
}) {
  const [value, setValue] = useState(initialValue);
  
  const {
    results,
    isSearching,
    search,
    clearSearch,
  } = useProductSearch(userId, {
    debounceMs: 150,
    minChars: 1,
    maxResults: 20,
  });

  const { autofillFromProduct } = useProductAutofill();

  useEffect(() => {
    if (visible) {
      setValue(initialValue);
      search(initialValue);
    } else {
      clearSearch();
    }
  }, [visible, initialValue]);

  const handleTextChange = useCallback((text) => {
    setValue(text);
    search(text);
  }, [search]);

  const handleSelect = useCallback((product) => {
    const autofillData = autofillFromProduct(product);
    onProductSelect?.(product, autofillData);
    onClose();
  }, [onProductSelect, autofillFromProduct, onClose]);

  const handleCreateNew = useCallback(() => {
    // Pass the current value as a new product
    onProductSelect?.({ name: value, isNew: true }, { name: value });
    onClose();
  }, [value, onProductSelect, onClose]);

  const renderItem = useCallback(({ item }) => (
    <Pressable
      style={styles.modalItem}
      onPress={() => handleSelect(item)}
    >
      <View style={styles.modalItemContent}>
        <ThemedText style={styles.modalItemName}>{item.name}</ThemedText>
        {item.manufacturer && (
          <ThemedText style={styles.modalItemSub}>{item.manufacturer}</ThemedText>
        )}
      </View>
      <View style={styles.modalItemRight}>
        {item.defaultRate && (
          <ThemedText style={styles.modalItemRate}>₹{item.defaultRate}</ThemedText>
        )}
        <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
      </View>
    </Pressable>
  ), [handleSelect]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <Pressable style={styles.modalCloseBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color="#0F172A" />
          </Pressable>
          <ThemedText style={styles.modalTitle}>Select Product</ThemedText>
          <View style={styles.modalCloseBtn} />
        </View>

        {/* Search Input */}
        <View style={styles.modalSearchContainer}>
          <Ionicons name="search" size={20} color="#64748B" />
          <TextInput
            style={styles.modalSearchInput}
            value={value}
            onChangeText={handleTextChange}
            placeholder="Search products..."
            placeholderTextColor="#94A3B8"
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
          />
          {isSearching && (
            <ActivityIndicator size="small" color="#64748B" />
          )}
          {value.length > 0 && !isSearching && (
            <Pressable onPress={() => handleTextChange('')}>
              <Ionicons name="close-circle" size={20} color="#94A3B8" />
            </Pressable>
          )}
        </View>

        {/* Results List */}
        <FlatList
          data={results}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.modalList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            value.length > 0 && (
              <Pressable style={styles.createNewItem} onPress={handleCreateNew}>
                <Ionicons name="add-circle" size={24} color="#4F46E5" />
                <View style={styles.createNewContent}>
                  <ThemedText style={styles.createNewText}>
                    Use "{value}"
                  </ThemedText>
                  <ThemedText style={styles.createNewSub}>
                    Create new product entry
                  </ThemedText>
                </View>
              </Pressable>
            )
          }
          ListEmptyComponent={
            value.length >= 2 && !isSearching && (
              <View style={styles.emptyResults}>
                <Ionicons name="search-outline" size={48} color="#CBD5E1" />
                <ThemedText style={styles.emptyText}>
                  No products found for "{value}"
                </ThemedText>
              </View>
            )
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 100,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  inputDisabled: {
    backgroundColor: '#F9FAFB',
    color: '#94A3B8',
  },
  loader: {
    position: 'absolute',
    right: 12,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    maxHeight: 280,
    zIndex: 1000,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  suggestionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 6,
  },
  suggestionsTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  suggestionsList: {
    maxHeight: 240,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  suggestionItemSelected: {
    backgroundColor: '#EBF5FF',
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  suggestionManufacturer: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  suggestionPrice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  suggestionRate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  usageBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  usageText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 10,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '500',
  },
  modalList: {
    padding: 12,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  modalItemContent: {
    flex: 1,
  },
  modalItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  modalItemSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  modalItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalItemRate: {
    fontSize: 14,
    fontWeight: '700',
    color: '#059669',
  },
  createNewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF5FF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    gap: 12,
  },
  createNewContent: {
    flex: 1,
  },
  createNewText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4F46E5',
  },
  createNewSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  emptyResults: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 12,
    textAlign: 'center',
  },
});
