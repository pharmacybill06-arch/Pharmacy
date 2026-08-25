import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Keyboard,
  Modal,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { distributorApi } from '@/services/api';

/**
 * Debounce hook
 */
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => clearTimeout(handler);
  }, [value, delay]);
  
  return debouncedValue;
}

/**
 * Autocomplete Suggestion Item
 */
const SuggestionItem = React.memo(({ item, onSelect, isSelected }) => (
  <Pressable
    style={[styles.suggestionItem, isSelected && styles.suggestionItemSelected]}
    onPress={() => onSelect(item)}
  >
    <View style={styles.avatarContainer}>
      <ThemedText style={styles.avatarText}>
        {item.name?.charAt(0)?.toUpperCase() || 'D'}
      </ThemedText>
    </View>
    <View style={styles.suggestionContent}>
      <ThemedText style={styles.suggestionName} numberOfLines={1}>
        {item.name}
      </ThemedText>
      {item.gstin && (
        <ThemedText style={styles.suggestionGstin} numberOfLines={1}>
          GSTIN: {item.gstin}
        </ThemedText>
      )}
      {item.phone && !item.gstin && (
        <ThemedText style={styles.suggestionGstin} numberOfLines={1}>
          Ph: {item.phone}
        </ThemedText>
      )}
    </View>
    {item._count?.bills > 0 && (
      <View style={styles.billCountBadge}>
        <ThemedText style={styles.billCountText}>{item._count.bills} bills</ThemedText>
      </View>
    )}
  </Pressable>
));

SuggestionItem.displayName = 'SuggestionItem';

/**
 * Add New Distributor Item
 */
const AddNewItem = React.memo(({ query, onPress }) => (
  <Pressable style={styles.addNewItem} onPress={onPress}>
    <View style={styles.addNewIcon}>
      <Ionicons name="add" size={20} color="#4F46E5" />
    </View>
    <ThemedText style={styles.addNewText}>
      Add "{query}" as new distributor
    </ThemedText>
  </Pressable>
));

AddNewItem.displayName = 'AddNewItem';

/**
 * DistributorAutocomplete Component
 * Shows distributor suggestions while typing
 */
export default function DistributorAutocomplete({
  userId,
  value,
  onChangeText,
  onDistributorSelect,
  onAddNew,
  placeholder = 'Search or add distributor',
  style,
  inputStyle,
  disabled = false,
  selectedDistributor = null,
}) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);
  
  const debouncedQuery = useDebounce(query, 300);

  // Search distributors when query changes
  useEffect(() => {
    const searchDistributors = async () => {
      if (!userId || debouncedQuery.length < 2) {
        setResults([]);
        setShowSuggestions(false);
        return;
      }
      
      setIsSearching(true);
      try {
        const response = await distributorApi.searchDistributors(userId, debouncedQuery);
        if (response.success) {
          setResults(response.data || []);
          setShowSuggestions(true);
        }
      } catch (error) {
        console.error('Distributor search error:', error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    };
    
    searchDistributors();
  }, [debouncedQuery, userId]);

  // Sync external value with internal query
  useEffect(() => {
    if (value !== undefined && value !== query) {
      setQuery(value);
    }
  }, [value]);

  const handleTextChange = useCallback((text) => {
    setQuery(text);
    onChangeText?.(text);
    
    // Clear selection if user types something different
    if (selectedDistributor && text !== selectedDistributor.name) {
      onDistributorSelect?.(null);
    }
  }, [onChangeText, selectedDistributor, onDistributorSelect]);

  const handleDistributorSelect = useCallback((distributor) => {
    setQuery(distributor.name);
    onChangeText?.(distributor.name);
    onDistributorSelect?.(distributor);
    setShowSuggestions(false);
    setResults([]);
    Keyboard.dismiss();
  }, [onChangeText, onDistributorSelect]);

  const handleAddNew = useCallback(() => {
    onAddNew?.(query);
    setShowSuggestions(false);
    Keyboard.dismiss();
  }, [query, onAddNew]);

  const handleFocus = useCallback(() => {
    if (results.length > 0 && query?.length >= 2) {
      setShowSuggestions(true);
    }
  }, [results, query]);

  const handleBlur = useCallback(() => {
    // Delay hiding to allow tap on suggestion
    setTimeout(() => {
      setShowSuggestions(false);
    }, 200);
  }, []);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.inputContainer}>
        <TextInput
          ref={inputRef}
          style={[styles.input, inputStyle, disabled && styles.inputDisabled]}
          value={query}
          onChangeText={handleTextChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          editable={!disabled}
        />
        {isSearching && (
          <ActivityIndicator 
            size="small" 
            color="#4F46E5" 
            style={styles.spinner}
          />
        )}
        {selectedDistributor && !isSearching && (
          <View style={styles.selectedIcon}>
            <Ionicons name="checkmark-circle" size={20} color="#059669" />
          </View>
        )}
      </View>
      
      {/* Suggestions dropdown — a plain ScrollView, not a FlatList, since this is often
          nested inside a parent ScrollView (e.g. the bill-header edit modal) and a
          VirtualizedList in that position trips RN's "VirtualizedLists should never be
          nested inside plain ScrollViews" warning. Results are a short, capped list, so
          virtualization buys nothing here anyway. */}
      {showSuggestions && (
        <View style={styles.suggestionsContainer}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={styles.suggestionsList}
            nestedScrollEnabled
          >
            {results.map((item, index) => (
              <SuggestionItem
                key={item.id}
                item={item}
                onSelect={handleDistributorSelect}
                isSelected={index === selectedIndex}
              />
            ))}
            {results.length === 0 && !isSearching && query.length >= 2 && (
              <ThemedText style={styles.emptyText}>
                No distributors found
              </ThemedText>
            )}
            {query.length >= 2 && !isSearching && (
              <AddNewItem query={query} onPress={handleAddNew} />
            )}
          </ScrollView>
        </View>
      )}
      
      {/* Selected distributor info */}
      {selectedDistributor && (
        <View style={styles.selectedInfo}>
          <ThemedText style={styles.selectedLabel}>Selected:</ThemedText>
          <ThemedText style={styles.selectedName}>{selectedDistributor.name}</ThemedText>
          {selectedDistributor.gstin && (
            <ThemedText style={styles.selectedGstin}>GSTIN: {selectedDistributor.gstin}</ThemedText>
          )}
        </View>
      )}
    </View>
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  inputDisabled: {
    backgroundColor: '#F1F5F9',
    color: '#94A3B8',
  },
  spinner: {
    marginRight: 12,
  },
  selectedIcon: {
    marginRight: 12,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    maxHeight: 250,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 999,
  },
  suggestionsList: {
    maxHeight: 250,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  suggestionItemSelected: {
    backgroundColor: '#EEF2FF',
  },
  avatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4F46E5',
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  suggestionGstin: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  billCountBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  billCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4F46E5',
  },
  addNewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  addNewIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  addNewText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
    flex: 1,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 16,
  },
  selectedInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
    gap: 4,
  },
  selectedLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  selectedName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  selectedGstin: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
});
